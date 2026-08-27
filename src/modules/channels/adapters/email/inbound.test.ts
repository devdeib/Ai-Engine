import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { emailInboundAdapter } from "@/modules/channels/adapters/email/inbound";
import {
  decodeSvixSecret,
  signSvixWebhook,
} from "@/modules/channels/adapters/email/signature";
import {
  EMAIL_SVIX_ID_HEADER,
  EMAIL_SVIX_SIGNATURE_HEADER,
  EMAIL_SVIX_TIMESTAMP_HEADER,
} from "@/modules/channels/adapters/email/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const MAILBOX = "sales@acme.example";
const SVIX_KEY = Buffer.from("0123456789abcdefghijklmn");
const SVIX_SECRET = `whsec_${SVIX_KEY.toString("base64")}`;
const MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TIMESTAMP = String(Math.floor(Date.now() / 1000));

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "email",
  status: "active",
  provider_destination_id: MAILBOX,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

const RAW_RECEIVED = JSON.stringify({
  type: "email.received",
  created_at: "2026-08-27T13:00:00.000Z",
  data: {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    from: "buyer@example.com",
    to: [MAILBOX],
    text: "Hello from email",
  },
});

function signedHeaders(rawBody: string, secret = SVIX_SECRET): Headers {
  const key = decodeSvixSecret(secret);
  if (!key) {
    throw new Error("test secret must decode");
  }
  const digest = signSvixWebhook(key, MSG_ID, TIMESTAMP, rawBody);
  const headers = new Headers();
  headers.set(EMAIL_SVIX_ID_HEADER, MSG_ID);
  headers.set(EMAIL_SVIX_TIMESTAMP_HEADER, TIMESTAMP);
  headers.set(EMAIL_SVIX_SIGNATURE_HEADER, `v1,${digest}`);
  return headers;
}

function mockSecrets(secret: string | null = SVIX_SECRET) {
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
                        provider_access_token: "re_" + "x".repeat(40),
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

describe("email inbound adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSecrets();
  });

  it("accepts a valid Svix-signed received event with text", async () => {
    const result = await emailInboundAdapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody: RAW_RECEIVED,
      headers: signedHeaders(RAW_RECEIVED),
    });
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe("buyer@example.com");
      expect(result.event.to).toBe(MAILBOX);
      expect(result.event.body).toBe("Hello from email");
    }
  });

  it("rejects a missing, malformed, or wrong signature with generic 401", async () => {
    await expect(
      emailInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_RECEIVED,
        headers: new Headers(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);

    const headers = signedHeaders(RAW_RECEIVED);
    headers.set(EMAIL_SVIX_SIGNATURE_HEADER, "v1,not-the-digest");
    await expect(
      emailInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_RECEIVED,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("does not accept WhatsApp or test HMAC headers", async () => {
    const headers = new Headers();
    headers.set("x-hub-signature-256", "sha256=abcd");
    headers.set("x-vg-signature", "deadbeef");
    headers.set("x-vg-timestamp", TIMESTAMP);
    await expect(
      emailInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_RECEIVED,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("fails closed when the signing secret is missing", async () => {
    mockSecrets(null);
    await expect(
      emailInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_RECEIVED,
        headers: signedHeaders(RAW_RECEIVED),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("does not verify against the access token", async () => {
    const accessToken = "re_" + "z".repeat(40);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      webhook_secret: accessToken.slice(0, 32),
                      provider_access_token: accessToken,
                      webhook_verify_token: null,
                    },
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

    await expect(
      emailInboundAdapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: RAW_RECEIVED,
        headers: signedHeaders(RAW_RECEIVED),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });
});
