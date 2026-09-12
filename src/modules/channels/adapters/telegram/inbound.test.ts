import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createTelegramInboundAdapter } from "@/modules/channels/adapters/telegram/inbound";
import { TELEGRAM_SECRET_TOKEN_HEADER } from "@/modules/channels/adapters/telegram/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const WEBHOOK_SECRET = "s".repeat(64);
const BOT_TOKEN = "123456:AA" + "x".repeat(30);
const BOT_DEST = "vg_sales_bot";

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "telegram",
  status: "active",
  provider_destination_id: BOT_DEST,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
};

const RAW_TEXT = JSON.stringify({
  update_id: 9001,
  message: {
    message_id: 12,
    date: 1710000000,
    chat: { id: 1001234567, type: "private" },
    text: "Hi",
  },
});

function mockSecrets(secret: string | null = WEBHOOK_SECRET) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "channel_account_secrets") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: secret
                    ? {
                        webhook_secret: secret,
                        provider_access_token: BOT_TOKEN,
                        webhook_verify_token: null,
                      }
                    : null,
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

function secretHeaders(secret = WEBHOOK_SECRET) {
  const headers = new Headers();
  headers.set(TELEGRAM_SECRET_TOKEN_HEADER, secret);
  return headers;
}

const adapter = createTelegramInboundAdapter();

describe("telegramInboundAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecrets();
  });

  it("verifies a valid secret token into CanonicalInbound", async () => {
    const result = await adapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody: RAW_TEXT,
      headers: secretHeaders(),
    });
    expect(result).toEqual({
      status: "inbound",
      event: expect.objectContaining({
        providerMessageId: "9001",
        from: "1001234567",
        to: BOT_DEST,
        body: "Hi",
      }),
    });
  });

  it("rejects a missing secret token", async () => {
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: new Headers(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an invalid secret token", async () => {
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: secretHeaders("t".repeat(64)),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("does not accept the bot token as the webhook secret", async () => {
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: secretHeaders(BOT_TOKEN),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("does not use the test-channel HMAC headers", async () => {
    const headers = new Headers();
    headers.set("x-vg-timestamp", "1710000000");
    headers.set("x-vg-signature", "deadbeef");
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects malformed JSON after a valid secret", async () => {
    const rawBody = "{not-json";
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: secretHeaders(),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
