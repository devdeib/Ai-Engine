/**
 * Telegram delivery through the generic worker. Retry policy is unchanged.
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

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "22222222-0000-4000-8000-0000000000bb";
const CHAT_ID = "1001234567";
const BODY = "Hello";
const BOT_TOKEN = "123456:AA" + "w".repeat(30);

function makeJob(overrides: Partial<ChannelDeliveryJob> = {}): ChannelDeliveryJob {
  return {
    id: "del-1",
    organization_id: ORG_A,
    channel_account_id: ACCOUNT_ID,
    message_id: MSG_1,
    status: "processing",
    attempt_count: 1,
    max_attempts: 3,
    available_at: "2026-09-09T00:00:00Z",
    locked_at: "2026-09-09T00:00:01Z",
    last_error_code: null,
    created_at: "2026-09-09T00:00:00Z",
    updated_at: "2026-09-09T00:00:01Z",
    completed_at: null,
    ...overrides,
  };
}

function mockTelegramScope(
  existingRef: {
    delivery_status: string | null;
    provider_message_id: string | null;
  } | null = { delivery_status: "queued", provider_message_id: null }
) {
  const refPatches: Record<string, unknown>[] = [];
  const jobPatches: Record<string, unknown>[] = [];
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") {
        return {
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
                    channel: "telegram",
                    status: "active",
                    provider_destination_id: "vg_sales_bot",
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
                    webhook_secret: "s".repeat(64),
                    provider_access_token: BOT_TOKEN,
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
                  data: { id: IDENTITY_ID, external_address: CHAT_ID },
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
  return { refPatches, jobPatches };
}

describe("Telegram delivery worker integration", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchImpl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends once, records the provider id, and never invokes AI or HITL", async () => {
    const { refPatches, jobPatches } = mockTelegramScope();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 88 } }), {
        status: 200,
      })
    );
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([makeJob()]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/sendMessage");
    expect(url).toContain(BOT_TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: CHAT_ID,
      text: BODY,
    });
    expect(refPatches[0]).toEqual(
      expect.objectContaining({
        delivery_status: "sent",
        provider_message_id: "88",
      })
    );
    expect(jobPatches[0]).toEqual(expect.objectContaining({ status: "completed" }));
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(executeFromRecommendation).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
  });

  it("retries a Telegram rate limit with the generic worker policy", async () => {
    const { jobPatches } = mockTelegramScope();
    fetchImpl.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error_code: 429 }), { status: 429 })
    );
    vi.mocked(claimChannelDeliveryJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);

    await processDueChannelDeliveryJobs({ organizationId: ORG_A });

    expect(jobPatches[0]).toEqual(
      expect.objectContaining({
        status: "pending",
        last_error_code: "HTTP_429",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });
});
