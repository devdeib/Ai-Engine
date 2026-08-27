import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { signChannelWebhook } from "@/modules/channels/hmac";
import { testInboundAdapter } from "@/modules/channels/adapters/test-inbound";
import {
  CHANNEL_WEBHOOK_SIGNATURE_HEADER,
  CHANNEL_WEBHOOK_TIMESTAMP_HEADER,
} from "@/modules/channels/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const SECRET = "c".repeat(32);
const BODY = '{"providerMessageId":"m1","from":"+974","to":"dest","body":"hi"}';

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "test",
  status: "active",
  provider_destination_id: "dest",
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

function mockLookup(secret: string | null = SECRET) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "channel_accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: account,
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
                  data: secret ? { webhook_secret: secret } : null,
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

function signedHeaders(rawBody: string, secret = SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signChannelWebhook(secret, timestamp, rawBody);
  const headers = new Headers();
  headers.set(CHANNEL_WEBHOOK_TIMESTAMP_HEADER, timestamp);
  headers.set(CHANNEL_WEBHOOK_SIGNATURE_HEADER, signature);
  return headers;
}

describe("testInboundAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookup();
  });

  it("verifies a valid HMAC payload into the canonical inbound contract", async () => {
    const result = await testInboundAdapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody: BODY,
      headers: signedHeaders(BODY),
    });
    expect(result).toEqual({
      status: "inbound",
      event: {
        providerMessageId: "m1",
        from: "+974",
        to: "dest",
        body: "hi",
      },
    });
  });

  it("rejects an invalid HMAC signature", async () => {
    const headers = signedHeaders(BODY, "d".repeat(32));
    await expect(
      testInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: BODY,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a malformed payload after HMAC success", async () => {
    const rawBody = '{"providerMessageId":"m1"}';
    await expect(
      testInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
