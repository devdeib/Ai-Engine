import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { whatsappInboundAdapter } from "@/modules/channels/adapters/whatsapp/inbound";
import { signWhatsAppWebhook } from "@/modules/channels/adapters/whatsapp/signature";
import { WHATSAPP_SIGNATURE_HEADER } from "@/modules/channels/adapters/whatsapp/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const APP_SECRET = "c".repeat(32);
const PHONE_NUMBER_ID = "123456789012345";

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "whatsapp",
  status: "active",
  provider_destination_id: PHONE_NUMBER_ID,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

const RAW_TEXT = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: PHONE_NUMBER_ID },
            messages: [
              {
                from: "9745550001",
                id: "wamid.1",
                timestamp: "1710000000",
                type: "text",
                text: { body: "Hi" },
              },
            ],
          },
        },
      ],
    },
  ],
});

function mockSecrets(secret: string | null = APP_SECRET) {
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
                        provider_access_token: "EAAG." + "x".repeat(80),
                        webhook_verify_token: "verify",
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

function signedHeaders(rawBody: string, secret = APP_SECRET) {
  const headers = new Headers();
  headers.set(
    WHATSAPP_SIGNATURE_HEADER,
    `sha256=${signWhatsAppWebhook(secret, rawBody)}`
  );
  return headers;
}

describe("whatsappInboundAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecrets();
  });

  it("verifies a valid X-Hub-Signature-256 payload into CanonicalInbound", async () => {
    const result = await whatsappInboundAdapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody: RAW_TEXT,
      headers: signedHeaders(RAW_TEXT),
    });
    expect(result).toEqual({
      status: "inbound",
      event: expect.objectContaining({
        providerMessageId: "wamid.1",
        from: "9745550001",
        to: PHONE_NUMBER_ID,
        body: "Hi",
      }),
    });
  });

  it("rejects a missing signature", async () => {
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: new Headers(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a malformed signature", async () => {
    const headers = new Headers();
    headers.set(WHATSAPP_SIGNATURE_HEADER, "sha256=nope");
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects an incorrect signature without leaking comparison details", async () => {
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: signedHeaders(RAW_TEXT, "d".repeat(32)),
      })
    ).rejects.toThrow("Authentication required");
  });

  it("rejects a signed body that was tampered after signing", async () => {
    const headers = signedHeaders(RAW_TEXT);
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT.replace("Hi", "Ho"),
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("does not use the test-channel HMAC headers", async () => {
    const headers = new Headers();
    headers.set("x-vg-timestamp", "1710000000");
    headers.set("x-vg-signature", "deadbeef");
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects malformed JSON after a valid signature", async () => {
    const rawBody = "{not-json";
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not accept a signature computed with the Graph access token", async () => {
    const accessToken = "EAAG." + "x".repeat(80);
    await expect(
      whatsappInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_TEXT,
        headers: signedHeaders(RAW_TEXT, accessToken),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
