import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { AuthenticationError, ValidationError } from "@/lib/errors";
import { createSmsInboundAdapter } from "@/modules/channels/adapters/sms/inbound";
import {
  SMS_SIGNATURE_HEADER,
  SMS_TIMESTAMP_HEADER,
} from "@/modules/channels/adapters/sms/constants";
import {
  signTelnyxWebhook,
  telnyxPublicKeyToBase64,
} from "@/modules/channels/adapters/sms/signature";
import type { ChannelAccount } from "@/lib/db/types";
import type { ChannelAccountSecretMaterial } from "@/modules/channels/secrets";

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const DEST = "+17735550001";
const FROM = "+17735550002";
const MSG_ID = "403193d5-6802-43c2-bd39-10487abff809";
const ACCESS_TOKEN = "KEY" + "t".repeat(40);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = telnyxPublicKeyToBase64(publicKey);
const OTHER_PUBLIC_KEY = telnyxPublicKeyToBase64(
  generateKeyPairSync("ed25519").publicKey
);

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "sms",
  status: "active",
  provider_destination_id: DEST,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
};

function receivedPayload(overrides: Record<string, unknown> = {}) {
  const payloadOverrides =
    typeof overrides.payload === "object" && overrides.payload !== null
      ? (overrides.payload as Record<string, unknown>)
      : {};
  const { payload: _payload, ...dataOverrides } = overrides;
  return {
    data: {
      event_type: "message.received",
      id: "webhook-event-id",
      occurred_at: "2026-08-28T13:00:00.000Z",
      payload: {
        id: MSG_ID,
        type: "SMS",
        text: "Hello from SMS",
        from: { phone_number: FROM },
        to: [{ phone_number: DEST }],
        ...payloadOverrides,
      },
      ...dataOverrides,
    },
  };
}

function signedHeaders(rawBody: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const headers = new Headers();
  headers.set(SMS_TIMESTAMP_HEADER, timestamp);
  headers.set(SMS_SIGNATURE_HEADER, signTelnyxWebhook(privateKey, timestamp, rawBody));
  return headers;
}

describe("sms inbound adapter", () => {
  const loadSecrets = vi.fn();
  const adapter = createSmsInboundAdapter({ loadSecrets });
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  const secrets: ChannelAccountSecretMaterial = {
    webhookSecret: PUBLIC_KEY,
    providerAccessToken: ACCESS_TOKEN,
    webhookVerifyToken: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loadSecrets.mockResolvedValue(secrets);
    fetchSpy.mockReset();
  });

  afterAll(() => {
    fetchSpy.mockRestore();
  });

  async function verify(payload: unknown, headers?: Headers) {
    const rawBody = JSON.stringify(payload);
    return adapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody,
      headers: headers ?? signedHeaders(rawBody),
    });
  }

  it("verifies Ed25519 over the exact raw body and maps SMS received", async () => {
    const result = await verify(receivedPayload());
    expect(result).toEqual({
      status: "inbound",
      event: {
        providerMessageId: MSG_ID,
        from: FROM,
        to: DEST,
        body: "Hello from SMS",
        occurredAt: "2026-08-28T13:00:00.000Z",
      },
    });
    if (result.status === "inbound") {
      expect(result.event.providerMessageId).not.toBe("webhook-event-id");
      expect(result.event).not.toHaveProperty("organizationId");
      expect(JSON.stringify(result.event)).not.toContain(ACCESS_TOKEN);
      expect(JSON.stringify(result.event)).not.toContain(PUBLIC_KEY);
    }
    expect(loadSecrets).toHaveBeenCalledWith(ORG_A, ACCOUNT_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a reformatted JSON body that was signed in another shape", async () => {
    const compact = JSON.stringify(receivedPayload());
    const pretty = JSON.stringify(receivedPayload(), null, 2);
    const headers = signedHeaders(compact);
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody: pretty,
        headers,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects missing, malformed, wrong, and mismatched signatures", async () => {
    const rawBody = JSON.stringify(receivedPayload());
    const timestamp = String(Math.floor(Date.now() / 1000));

    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: new Headers({ [SMS_TIMESTAMP_HEADER]: timestamp }),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);

    const malformed = new Headers();
    malformed.set(SMS_TIMESTAMP_HEADER, timestamp);
    malformed.set(SMS_SIGNATURE_HEADER, "not-a-signature");
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: malformed,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);

    const wrong = new Headers();
    wrong.set(SMS_TIMESTAMP_HEADER, timestamp);
    wrong.set(SMS_SIGNATURE_HEADER, signTelnyxWebhook(privateKey, timestamp, "{}"));
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: wrong,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);

    loadSecrets.mockResolvedValue({
      ...secrets,
      webhookSecret: OTHER_PUBLIC_KEY,
    });
    await expect(verify(receivedPayload())).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("rejects invalid and expired timestamps", async () => {
    const rawBody = JSON.stringify(receivedPayload());
    const invalid = new Headers();
    invalid.set(SMS_TIMESTAMP_HEADER, "not-unix");
    invalid.set(
      SMS_SIGNATURE_HEADER,
      signTelnyxWebhook(privateKey, String(Math.floor(Date.now() / 1000)), rawBody)
    );
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: invalid,
      })
    ).rejects.toBeInstanceOf(AuthenticationError);

    const stale = String(Math.floor(Date.now() / 1000) - 301);
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account,
        rawBody,
        headers: signedHeaders(rawBody, stale),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("ignores signed sent, MMS, and empty-text events", async () => {
    await expect(
      verify(receivedPayload({ event_type: "message.sent" }))
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      verify(receivedPayload({ payload: { type: "MMS", text: "hi" } }))
    ).resolves.toEqual({ status: "ignored" });
    await expect(
      verify(receivedPayload({ payload: { text: "   " } }))
    ).resolves.toEqual({ status: "ignored" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws ValidationError for malformed supported SMS metadata", async () => {
    await expect(
      verify(receivedPayload({ payload: { id: "" } }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      verify(receivedPayload({ payload: { from: { phone_number: "" } } }))
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      verify(receivedPayload({ payload: { to: [] } }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a destination that does not match the account number", async () => {
    await expect(
      verify(
        receivedPayload({
          payload: { to: [{ phone_number: "+17735550999" }] },
        })
      )
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects a non-SMS account without falling back", async () => {
    const rawBody = JSON.stringify(receivedPayload());
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account: { ...account, channel: "whatsapp" },
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(loadSecrets).not.toHaveBeenCalled();
  });

  it("fails closed when tenant secrets are missing", async () => {
    loadSecrets.mockResolvedValue(null);
    await expect(verify(receivedPayload())).rejects.toBeInstanceOf(
      AuthenticationError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
