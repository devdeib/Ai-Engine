/**
 * SMS delivery through the generic worker. Retry policy is unchanged.
 * Telnyx POST /v2/messages has no documented Idempotency-Key; retries still
 * use the generic messageId key and remain at-least-once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { processConversationMessage } from "@/modules/ai/service";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { escalateToHuman, pauseAI, resumeAI } from "@/modules/ai/handoff";
import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";
import { telnyxMessagesUrl } from "@/modules/channels/adapters/sms/constants";
import { logger } from "@/lib/logger";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "22222222-0000-4000-8000-0000000000bb";
const FROM = "+17735550001";
const DEST = "+17735550002";
const BODY = "Hello";
const ACCESS_TOKEN = "KEY" + "w".repeat(40);
const PROVIDER_ID = "403193d5-6802-43c2-bd39-10487abff809";

function makeJob(overrides: Partial<ChannelDeliveryJob> = {}): ChannelDeliveryJob {
  return {
    id: "del-1",
    organization_id: ORG_A,
    channel_account_id: ACCOUNT_ID,
    message_id: MSG_1,
    status: "processing",
    attempt_count: 1,
    max_attempts: 3,
    available_at: "2026-08-28T00:00:00Z",
    locked_at: "2026-08-28T00:00:01Z",
    last_error_code: null,
    created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:01Z",
    completed_at: null,
    ...overrides,
  };
}

function mockSmsScope(
  existingRef: {
    delivery_status: string | null;
    provider_message_id: string | null;
  } | null = { delivery_status: "queued", provider_message_id: null }
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
                    channel: "sms",
                    status: "active",
                    provider_destination_id: FROM,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "channel_account_secrets") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    webhook_secret: Buffer.alloc(32, 7).toString("base64"),
                    provider_access_token: ACCESS_TOKEN,
                    webhook_verify_token: null,
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
                  data: { id: IDENTITY_ID, external_address: DEST },
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
                      ? { channel_identity_id: IDENTITY_ID, ...existingRef }
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

describe("SMS delivery worker integration", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchImpl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends once via Telnyx, records data.id, and never invokes AI or HITL", async () => {
    const { refPatches, jobPatches, messageInserts } = mockSmsScope();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: PROVIDER_ID } }), { status: 200 })
    );
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(telnyxMessagesUrl());
    expect(url).toBe("https://api.telnyx.com/v2/messages");
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(init.method).toBe("POST");
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(String(init.body))).toEqual({
      from: FROM,
      to: DEST,
      text: BODY,
    });
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "sent",
        provider_message_id: PROVIDER_ID,
      })
    );
    expect(jobPatches[0]).toEqual(expect.objectContaining({ status: "completed" }));
    expect(messageInserts).toHaveLength(0);
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(executeFromRecommendation).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
  });

  it("retries a retryable provider failure with the same messageId", async () => {
    const { jobPatches } = mockSmsScope();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ title: "rate limited" }] }), {
        status: 429,
      })
    );
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const retryCall = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(retryCall[1].body))).toEqual({
      from: FROM,
      to: DEST,
      text: BODY,
    });
    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "pending",
        last_error_code: "RATE_LIMITED",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("fails terminal provider errors immediately", async () => {
    const { jobPatches } = mockSmsScope();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ code: "10011" }] }), { status: 401 })
    );
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "INVALID_ACCESS_TOKEN",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not send again when the outbound ref is already sent", async () => {
    const { messageInserts } = mockSmsScope({
      delivery_status: "sent",
      provider_message_id: PROVIDER_ID,
    });
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(messageInserts).toHaveLength(0);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not fall back to Test/WhatsApp/Email and does not log the token", async () => {
    mockSmsScope();
    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.telnyx.com/v2/messages");
    expect(url).not.toContain("graph.facebook.com");
    expect(url).not.toContain("api.resend.com");
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toContain("Bearer");
  });
});
