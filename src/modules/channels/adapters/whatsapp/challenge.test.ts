import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ role: "service" })),
}));
vi.mock("@/lib/supabase/client-override", () => ({
  runWithSupabaseClientOverride: vi.fn(
    async (_client: unknown, fn: () => Promise<unknown>) => fn()
  ),
}));

import { createClient } from "@/lib/supabase/server";
import { handleWhatsAppWebhookChallenge } from "@/modules/channels/adapters/whatsapp/challenge";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const VERIFY_TOKEN = "verify-token-value";
const CHALLENGE = "1158201444";

const inserts: unknown[] = [];

function mockAccount(account: Record<string, unknown> | null, verifyToken: string | null) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "channel_accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: account, error: null }),
            }),
          }),
          insert: vi.fn().mockImplementation((row: unknown) => {
            inserts.push(row);
            return { select: vi.fn() };
          }),
        };
      }
      if (table === "channel_account_secrets") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: verifyToken
                    ? {
                        webhook_secret: "c".repeat(32),
                        webhook_verify_token: verifyToken,
                      }
                    : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        insert: vi.fn().mockImplementation((row: unknown) => {
          inserts.push(row);
        }),
      };
    }),
    rpc: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function params(overrides: Record<string, string | null> = {}) {
  const search = new URLSearchParams();
  const values = {
    "hub.mode": "subscribe",
    "hub.verify_token": VERIFY_TOKEN,
    "hub.challenge": CHALLENGE,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) search.set(key, value);
  }
  return search;
}

const activeWhatsApp = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "whatsapp",
  status: "active",
};

describe("handleWhatsAppWebhookChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    mockAccount(activeWhatsApp, VERIFY_TOKEN);
  });

  it("returns the exact challenge for a valid verify token", async () => {
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params(),
      })
    ).resolves.toBe(CHALLENGE);
    expect(inserts).toHaveLength(0);
  });

  it("rejects an invalid verify token with generic authentication failure", async () => {
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params({ "hub.verify_token": "wrong" }),
      })
    ).rejects.toThrow("Authentication required");
  });

  it("rejects missing challenge parameters", async () => {
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params({ "hub.challenge": null, "hub.mode": null }),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an inactive account", async () => {
    mockAccount({ ...activeWhatsApp, status: "paused" }, VERIFY_TOKEN);
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a non-WhatsApp account", async () => {
    mockAccount({ ...activeWhatsApp, channel: "test" }, VERIFY_TOKEN);
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an unknown account without leaking existence", async () => {
    mockAccount(null, VERIFY_TOKEN);
    await expect(
      handleWhatsAppWebhookChallenge({
        channelAccountId: ACCOUNT_ID,
        searchParams: params(),
      })
    ).rejects.toThrow("Authentication required");
  });
});
