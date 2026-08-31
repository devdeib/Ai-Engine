/**
 * Delivery enqueue reliability. Unique (organization_id, message_id) remains
 * idempotent; non-unique failures must surface to the caller.
 *
 * Writes use the server-only admin client. The session client must not insert
 * channel_message_refs or channel_delivery_jobs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import type { createAdminClient as createAdminSupabaseClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/schedule", () => ({
  scheduleChannelDeliveryProcessing: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleChannelDeliveryProcessing } from "@/modules/channels/delivery/schedule";
import {
  enqueueChannelDelivery,
  enqueueOutboundDeliveryIfExternal,
} from "@/modules/channels/delivery/enqueue";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "22222222-0000-4000-8000-0000000000bb";

function mockInserts(input: {
  refError?: { code?: string; message: string } | null;
  jobError?: { code?: string; message: string } | null;
}) {
  const refInsert = vi.fn().mockResolvedValue({
    error: input.refError ?? null,
  });
  const jobInsert = vi.fn().mockResolvedValue({
    error: input.jobError ?? null,
  });
  const adminFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "channel_message_refs") return { insert: refInsert };
    if (table === "channel_delivery_jobs") return { insert: jobInsert };
    return {};
  });
  const sessionFrom = vi.fn().mockImplementation(() => {
    throw new Error("session client must not write delivery rows");
  });

  vi.mocked(createAdminClient).mockReturnValue({
    from: adminFrom,
  } as unknown as ReturnType<typeof createAdminSupabaseClient>);
  vi.mocked(createClient).mockResolvedValue({
    from: sessionFrom,
  } as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);

  return { refInsert, jobInsert, adminFrom, sessionFrom };
}

describe("enqueueChannelDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts refs and jobs through the admin client, not the session client", async () => {
    const { refInsert, jobInsert, adminFrom, sessionFrom } = mockInserts({});

    await enqueueChannelDelivery({
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
    });

    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(sessionFrom).not.toHaveBeenCalled();
    expect(adminFrom).toHaveBeenCalledWith("channel_message_refs");
    expect(adminFrom).toHaveBeenCalledWith("channel_delivery_jobs");
    expect(refInsert).toHaveBeenCalledTimes(1);
    expect(jobInsert).toHaveBeenCalledTimes(1);
  });

  it("persists an outbound ref and delivery job on success", async () => {
    const { refInsert, jobInsert } = mockInserts({});

    await enqueueChannelDelivery({
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
    });

    expect(refInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_A,
        message_id: MSG_1,
        channel_account_id: ACCOUNT_ID,
        channel_identity_id: IDENTITY_ID,
        direction: "outbound",
        delivery_status: "queued",
      })
    );
    expect(jobInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_A,
        message_id: MSG_1,
        status: "pending",
        max_attempts: 3,
      })
    );
    expect(scheduleChannelDeliveryProcessing).toHaveBeenCalledTimes(1);
  });

  it("treats a unique delivery-job conflict as idempotent success", async () => {
    mockInserts({
      jobError: { code: "23505", message: "duplicate key" },
    });

    await expect(
      enqueueChannelDelivery({
        organizationId: ORG_A,
        channelAccountId: ACCOUNT_ID,
        channelIdentityId: IDENTITY_ID,
        messageId: MSG_1,
      })
    ).resolves.toBeUndefined();

    expect(scheduleChannelDeliveryProcessing).toHaveBeenCalledTimes(1);
  });

  it("treats a unique outbound-ref conflict as idempotent and still inserts the job", async () => {
    const { jobInsert } = mockInserts({
      refError: { code: "23505", message: "duplicate key" },
    });

    await enqueueChannelDelivery({
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
    });

    expect(jobInsert).toHaveBeenCalledTimes(1);
    expect(scheduleChannelDeliveryProcessing).toHaveBeenCalledTimes(1);
  });

  it("surfaces a non-unique job insert failure without claiming success", async () => {
    const { jobInsert } = mockInserts({
      jobError: { code: "40001", message: "could not serialize" },
    });

    await expect(
      enqueueChannelDelivery({
        organizationId: ORG_A,
        channelAccountId: ACCOUNT_ID,
        channelIdentityId: IDENTITY_ID,
        messageId: MSG_1,
      })
    ).rejects.toThrow("Failed to enqueue channel delivery job");

    expect(jobInsert).toHaveBeenCalledTimes(1);
    expect(scheduleChannelDeliveryProcessing).not.toHaveBeenCalled();
  });

  it("surfaces a non-unique ref insert failure without deleting the outbound message", async () => {
    const { refInsert, jobInsert } = mockInserts({
      refError: { code: "57014", message: "statement timeout" },
    });

    await expect(
      enqueueChannelDelivery({
        organizationId: ORG_A,
        channelAccountId: ACCOUNT_ID,
        channelIdentityId: IDENTITY_ID,
        messageId: MSG_1,
      })
    ).rejects.toThrow("Failed to persist outbound channel message ref");

    expect(refInsert).toHaveBeenCalledTimes(1);
    expect(jobInsert).not.toHaveBeenCalled();
    expect(scheduleChannelDeliveryProcessing).not.toHaveBeenCalled();
  });

  it("does not enqueue in_app conversations", async () => {
    const { refInsert, jobInsert } = mockInserts({});

    await enqueueOutboundDeliveryIfExternal({
      organizationId: ORG_A,
      conversation: {
        channel: "in_app",
        channel_account_id: ACCOUNT_ID,
        channel_identity_id: IDENTITY_ID,
      },
      messageId: MSG_1,
    });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(refInsert).not.toHaveBeenCalled();
    expect(jobInsert).not.toHaveBeenCalled();
    expect(scheduleChannelDeliveryProcessing).not.toHaveBeenCalled();
  });

  it("does not enqueue when channel_account_id is missing", async () => {
    const { refInsert, jobInsert } = mockInserts({});

    await enqueueOutboundDeliveryIfExternal({
      organizationId: ORG_A,
      conversation: {
        channel: "whatsapp",
        channel_account_id: null,
        channel_identity_id: IDENTITY_ID,
      },
      messageId: MSG_1,
    });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(refInsert).not.toHaveBeenCalled();
    expect(jobInsert).not.toHaveBeenCalled();
    expect(scheduleChannelDeliveryProcessing).not.toHaveBeenCalled();
  });

  it("does not enqueue when channel_identity_id is missing", async () => {
    const { refInsert, jobInsert } = mockInserts({});

    await enqueueOutboundDeliveryIfExternal({
      organizationId: ORG_A,
      conversation: {
        channel: "whatsapp",
        channel_account_id: ACCOUNT_ID,
        channel_identity_id: null,
      },
      messageId: MSG_1,
    });

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(refInsert).not.toHaveBeenCalled();
    expect(jobInsert).not.toHaveBeenCalled();
    expect(scheduleChannelDeliveryProcessing).not.toHaveBeenCalled();
  });

  it.each(["test", "whatsapp", "email", "sms"] as const)(
    "enqueues %s outbound conversations",
    async (channel) => {
      const { refInsert, jobInsert } = mockInserts({});

      await enqueueOutboundDeliveryIfExternal({
        organizationId: ORG_A,
        conversation: {
          channel,
          channel_account_id: ACCOUNT_ID,
          channel_identity_id: IDENTITY_ID,
        },
        messageId: MSG_1,
      });

      expect(createAdminClient).toHaveBeenCalledTimes(1);
      expect(createClient).not.toHaveBeenCalled();
      expect(refInsert).toHaveBeenCalledTimes(1);
      expect(jobInsert).toHaveBeenCalledTimes(1);
      expect(scheduleChannelDeliveryProcessing).toHaveBeenCalledTimes(1);
    }
  );
});
