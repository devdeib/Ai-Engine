/**
 * Channel delivery worker tests. Delivery is not an AI execution authority.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChannelDeliveryJob } from "@/lib/db/types";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ role: "service" })),
}));
vi.mock("@/lib/supabase/client-override", () => ({
  runWithSupabaseClientOverride: vi.fn(
    async (_client: unknown, fn: () => Promise<number>) => fn()
  ),
}));
vi.mock("@/modules/channels/delivery/claim", () => ({
  claimChannelDeliveryJobs: vi.fn(),
}));
vi.mock("@/modules/channels/adapters/registry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/channels/adapters/registry")>();
  return {
    ...actual,
    getDeliveryAdapter: vi.fn(),
  };
});
vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));
vi.mock("@/modules/ai/execution/execute", () => ({
  executeFromRecommendation: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  escalateToHuman: vi.fn(),
  pauseAI: vi.fn(),
  resumeAI: vi.fn(),
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
import { claimChannelDeliveryJobs } from "@/modules/channels/delivery/claim";
import {
  getDeliveryAdapter,
  UnsupportedChannelError,
} from "@/modules/channels/adapters/registry";
import { processConversationMessage } from "@/modules/ai/service";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { escalateToHuman, pauseAI, resumeAI } from "@/modules/ai/handoff";
import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";
import type { ChannelDeliveryAdapter } from "@/modules/channels/adapters/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "22222222-0000-4000-8000-0000000000bb";
const DEST = "+9745550001";
const BODY = "Hello";

function makeJob(overrides: Partial<ChannelDeliveryJob> = {}): ChannelDeliveryJob {
  return {
    id: "del-1",
    organization_id: ORG_A,
    channel_account_id: ACCOUNT_ID,
    message_id: MSG_1,
    status: "processing",
    attempt_count: 1,
    max_attempts: 3,
    available_at: "2026-08-27T00:00:00Z",
    locked_at: "2026-08-27T00:00:01Z",
    last_error_code: null,
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:01Z",
    completed_at: null,
    ...overrides,
  };
}

function mockDeliveryScope(
  existingRef: {
    delivery_status: string | null;
    provider_message_id: string | null;
    channel_identity_id?: string;
  } | null = {
    delivery_status: "queued",
    provider_message_id: null,
    channel_identity_id: IDENTITY_ID,
  }
) {
  const refPatches: Record<string, unknown>[] = [];
  const jobPatches: Record<string, unknown>[] = [];
  const messageInserts: unknown[] = [];
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") {
        return {
          insert: vi.fn().mockImplementation((row: unknown) => {
            messageInserts.push(row);
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              }),
            };
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: MSG_1,
                    organization_id: ORG_A,
                    direction: "outbound",
                    body: BODY,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "channel_accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: ACCOUNT_ID,
                    organization_id: ORG_A,
                    channel: "test",
                    status: "active",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "channel_identities") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: IDENTITY_ID,
                    external_address: DEST,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "channel_message_refs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: existingRef
                      ? {
                          channel_identity_id: IDENTITY_ID,
                          ...existingRef,
                        }
                      : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          update: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
            refPatches.push(patch);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        };
      }
      if (table === "channel_delivery_jobs") {
        return {
          update: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
            jobPatches.push(patch);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            };
          }),
        };
      }
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { refPatches, jobPatches, messageInserts };
}

function mockSend(
  send: ChannelDeliveryAdapter["send"]
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(send);
  vi.mocked(getDeliveryAdapter).mockReturnValue({ send: fn });
  return fn;
}

describe("processDueChannelDeliveryJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend(async () => ({
      ok: true,
      providerMessageId: `loopback:${MSG_1}`,
    }));
  });

  it("marks adapter delivery sent without invoking AI execution", async () => {
    const { refPatches, jobPatches } = mockDeliveryScope();
    const send = mockSend(async () => ({
      ok: true,
      providerMessageId: `loopback:${MSG_1}`,
    }));
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(send).toHaveBeenCalledWith({
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
      destination: DEST,
      body: BODY,
      idempotencyKey: MSG_1,
    });
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "sent",
        provider_message_id: `loopback:${MSG_1}`,
      })
    );
    expect(jobPatches[0]).toEqual(expect.objectContaining({ status: "completed" }));
  });

  it("isolates delivery failure from AI execution", async () => {
    const { refPatches, jobPatches } = mockDeliveryScope();
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 3, max_attempts: 3 }),
    ]);
    mockSend(async () => {
      throw new Error("loopback failed");
    });

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "CHANNEL_DELIVERY_FAILED",
      })
    );
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "failed",
        provider_error_code: "CHANNEL_DELIVERY_FAILED",
      })
    );
  });

  it("retries a retryable adapter failure then succeeds without recreating the message or invoking AI", async () => {
    const { refPatches, jobPatches, messageInserts } = mockDeliveryScope();
    const send = mockSend(async () => ({
      ok: false,
      errorCode: "CHANNEL_DELIVERY_FAILED",
      retryable: true,
    }));
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValueOnce([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "pending",
        last_error_code: "CHANNEL_DELIVERY_FAILED",
        completed_at: null,
      })
    );
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "queued",
        provider_error_code: "CHANNEL_DELIVERY_FAILED",
      })
    );
    expect(messageInserts).toHaveLength(0);
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(executeFromRecommendation).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();

    send.mockResolvedValueOnce({
      ok: true,
      providerMessageId: `loopback:${MSG_1}`,
    });
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValueOnce([
      makeJob({ attempt_count: 2, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messageId: MSG_1,
      idempotencyKey: MSG_1,
    }));
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messageId: MSG_1,
      idempotencyKey: MSG_1,
    }));
    expect(jobPatches[1]).toEqual(expect.objectContaining({ status: "completed" }));
    expect(refPatches[1]).toEqual(
      expect.objectContaining({
        delivery_status: "sent",
        provider_message_id: `loopback:${MSG_1}`,
      })
    );
    expect(messageInserts).toHaveLength(0);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("fails terminal adapter errors without retrying", async () => {
    const { refPatches, jobPatches } = mockDeliveryScope();
    mockSend(async () => ({
      ok: false,
      errorCode: "INVALID_DESTINATION",
      retryable: false,
    }));
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "INVALID_DESTINATION",
      })
    );
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "failed",
        provider_error_code: "INVALID_DESTINATION",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("completes a reclaimed job without sending again when the provider already accepted it", async () => {
    const { refPatches, jobPatches, messageInserts } = mockDeliveryScope({
      delivery_status: "sent",
      provider_message_id: `loopback:${MSG_1}`,
      channel_identity_id: IDENTITY_ID,
    });
    const send = mockSend(async () => ({
      ok: true,
      providerMessageId: `loopback:${MSG_1}`,
    }));
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 2, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(send).not.toHaveBeenCalled();
    expect(refPatches).toHaveLength(0);
    expect(jobPatches[0]).toEqual(expect.objectContaining({ status: "completed" }));
    expect(messageInserts).toHaveLength(0);
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(executeFromRecommendation).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
  });

  it("fails unsupported channels without falling back to the test adapter", async () => {
    const { jobPatches } = mockDeliveryScope();
    vi.mocked(getDeliveryAdapter).mockImplementation(() => {
      throw new UnsupportedChannelError("unknown");
    });
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "CHANNEL_UNSUPPORTED",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });
});
