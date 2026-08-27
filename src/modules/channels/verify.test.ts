import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { signChannelWebhook } from "@/modules/channels/hmac";
import { verifyTestChannelWebhook } from "@/modules/channels/verify";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SECRET = "c".repeat(32);
const BODY = '{"providerMessageId":"m1","from":"a","to":"dest","body":"hi"}';

function mockLookup(options: {
  account?: Record<string, unknown> | null;
  secret?: string | null;
}) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "channel_accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: options.account ?? null,
                error: null,
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
                  data: options.secret ? { webhook_secret: options.secret } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

const activeAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "test",
  status: "active",
  provider_destination_id: "dest",
};

describe("verifyTestChannelWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a fresh matching signature for an active account", async () => {
    mockLookup({ account: activeAccount, secret: SECRET });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signChannelWebhook(SECRET, timestamp, BODY);
    const account = await verifyTestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: BODY,
      timestampHeader: timestamp,
      signatureHeader: signature,
    });
    expect(account.id).toBe(ACCOUNT_ID);
  });

  it("returns a generic 401 for an unknown account", async () => {
    mockLookup({ account: null, secret: SECRET });
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(
      verifyTestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: BODY,
        timestampHeader: timestamp,
        signatureHeader: signChannelWebhook(SECRET, timestamp, BODY),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("returns a generic 401 for an inactive account", async () => {
    mockLookup({
      account: { ...activeAccount, status: "paused" },
      secret: SECRET,
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(
      verifyTestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: BODY,
        timestampHeader: timestamp,
        signatureHeader: signChannelWebhook(SECRET, timestamp, BODY),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("returns a generic 401 for the wrong secret", async () => {
    mockLookup({ account: activeAccount, secret: SECRET });
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(
      verifyTestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: BODY,
        timestampHeader: timestamp,
        signatureHeader: signChannelWebhook("d".repeat(32), timestamp, BODY),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("returns a generic 401 for a replayed timestamp", async () => {
    mockLookup({ account: activeAccount, secret: SECRET });
    const timestamp = String(Math.floor((Date.now() - 6 * 60 * 1000) / 1000));
    await expect(
      verifyTestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: BODY,
        timestampHeader: timestamp,
        signatureHeader: signChannelWebhook(SECRET, timestamp, BODY),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
