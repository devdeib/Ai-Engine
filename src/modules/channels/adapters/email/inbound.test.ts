import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  createEmailInboundAdapter,
  emailInboundAdapter,
} from "@/modules/channels/adapters/email/inbound";
import {
  decodeSvixSecret,
  signSvixWebhook,
} from "@/modules/channels/adapters/email/signature";
import {
  EMAIL_SVIX_ID_HEADER,
  EMAIL_SVIX_SIGNATURE_HEADER,
  EMAIL_SVIX_TIMESTAMP_HEADER,
  resendReceivingEmailUrl,
} from "@/modules/channels/adapters/email/constants";
import type { ChannelAccount } from "@/lib/db/types";
import type { ChannelAccountSecretMaterial } from "@/modules/channels/secrets";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const MAILBOX = "sales@acme.example";
const SVIX_KEY = Buffer.from("0123456789abcdefghijklmn");
const SVIX_SECRET = `whsec_${SVIX_KEY.toString("base64")}`;
const ACCESS_TOKEN = "re_" + "x".repeat(40);
const MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const EMAIL_ID = "56761188-7520-42d8-8898-ff6fc54ce618";
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

function receivedPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    created_at: "2026-08-27T13:00:00.000Z",
    data: {
      email_id: EMAIL_ID,
      from: "buyer@example.com",
      to: [MAILBOX],
      ...overrides,
    },
  };
}

function rawReceived(overrides: Record<string, unknown> = {}) {
  return JSON.stringify(receivedPayload(overrides));
}

function signedHeaders(
  rawBody: string,
  options: { timestamp?: string } = {}
): Headers {
  const key = decodeSvixSecret(SVIX_SECRET);
  if (!key) {
    throw new Error("test secret must decode");
  }
  const timestamp = options.timestamp ?? TIMESTAMP;
  const digest = signSvixWebhook(key, MSG_ID, timestamp, rawBody);
  const headers = new Headers();
  headers.set(EMAIL_SVIX_ID_HEADER, MSG_ID);
  headers.set(EMAIL_SVIX_TIMESTAMP_HEADER, timestamp);
  headers.set(EMAIL_SVIX_SIGNATURE_HEADER, `v1,${digest}`);
  return headers;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("email inbound adapter", () => {
  const fetchImpl = vi.fn();
  const loadSecrets = vi.fn();
  const adapter = createEmailInboundAdapter({ fetchImpl, loadSecrets });

  const secrets: ChannelAccountSecretMaterial = {
    webhookSecret: SVIX_SECRET,
    providerAccessToken: ACCESS_TOKEN,
    webhookVerifyToken: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    loadSecrets.mockResolvedValue(secrets);
    fetchImpl.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { text: "Hello from email" }))
    );
  });

  async function verify(rawBody: string, headers?: Headers) {
    return adapter.verifyAndParse({
      channelAccountId: ACCOUNT_ID,
      account,
      rawBody,
      headers: headers ?? signedHeaders(rawBody),
    });
  }

  it("accepts a valid Svix signature over the raw body and fetches Receiving text", async () => {
    const rawBody = rawReceived();
    const result = await verify(rawBody);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe("buyer@example.com");
      expect(result.event.to).toBe(MAILBOX);
      expect(result.event.body).toBe("Hello from email");
      expect(result.event.providerMessageId).toBe(EMAIL_ID);
    }
  });

  it("rejects reformatted JSON that was not the signed raw body", async () => {
    const rawBody = rawReceived();
    const reformatted = JSON.stringify(JSON.parse(rawBody), null, 2);
    await expect(
      verify(reformatted, signedHeaders(rawBody))
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts any matching v1 signature when multiple are present", async () => {
    const rawBody = rawReceived();
    const key = decodeSvixSecret(SVIX_SECRET);
    if (!key) {
      throw new Error("test secret must decode");
    }
    const digest = signSvixWebhook(key, MSG_ID, TIMESTAMP, rawBody);
    const headers = new Headers();
    headers.set(EMAIL_SVIX_ID_HEADER, MSG_ID);
    headers.set(EMAIL_SVIX_TIMESTAMP_HEADER, TIMESTAMP);
    headers.set(EMAIL_SVIX_SIGNATURE_HEADER, `v1,not-this-one v1,${digest}`);
    await expect(verify(rawBody, headers)).resolves.toEqual(
      expect.objectContaining({ status: "inbound" })
    );
  });

  it("rejects missing Svix headers with generic 401", async () => {
    await expect(verify(rawReceived(), new Headers())).rejects.toBeInstanceOf(
      AuthenticationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a malformed Svix signature with generic 401", async () => {
    const rawBody = rawReceived();
    const headers = signedHeaders(rawBody);
    headers.set(EMAIL_SVIX_SIGNATURE_HEADER, "sha256=abcd");
    await expect(verify(rawBody, headers)).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("rejects a wrong Svix signature with generic 401", async () => {
    const rawBody = rawReceived();
    const headers = signedHeaders(rawBody);
    headers.set(EMAIL_SVIX_SIGNATURE_HEADER, "v1,not-the-digest");
    await expect(verify(rawBody, headers)).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("rejects a timestamp outside the ±300 second window", async () => {
    const rawBody = rawReceived();
    const stale = String(Math.floor(Date.now() / 1000) - 301);
    await expect(
      verify(rawBody, signedHeaders(rawBody, { timestamp: stale }))
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("calls Receiving API with the email id and Bearer token, never in the URL", async () => {
    const rawBody = rawReceived();
    await verify(rawBody);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(resendReceivingEmailUrl(EMAIL_ID));
    expect(url).toContain(EMAIL_ID);
    expect(url).toBe("https://api.resend.com/emails/receiving/" + EMAIL_ID);
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: `Bearer ${ACCESS_TOKEN}` })
    );
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(url).not.toContain("re_");
  });

  it("does not log the access token", async () => {
    fetchImpl.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(verify(rawReceived())).rejects.toThrow(
      "Failed to load received email"
    );
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toContain("Bearer");
    expect(logged).not.toContain(SVIX_SECRET);
  });

  it("does not use webhook data.text; Receiving API text is canonical", async () => {
    const rawBody = rawReceived({ text: "webhook text must be ignored" });
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, { text: "Hello from receiving API" })
    );
    const result = await verify(rawBody);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.body).toBe("Hello from receiving API");
    }
  });

  it.each([
    "email.delivered",
    "email.bounced",
    "email.opened",
    "email.clicked",
    "email.complained",
  ])("ignores %s without calling Receiving API", async (type) => {
    const rawBody = JSON.stringify({ type, data: { email_id: EMAIL_ID } });
    await expect(verify(rawBody)).resolves.toEqual({ status: "ignored" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ignores a received event when Receiving API has no usable plain text", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(200, { html: "<p>only html</p>", text: null })
    );
    await expect(verify(rawReceived())).resolves.toEqual({ status: "ignored" });
  });

  it("throws 422 for authenticated received metadata missing required fields", async () => {
    await expect(verify(rawReceived({ email_id: "" }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(verify(rawReceived({ from: "" }))).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(verify(rawReceived({ to: [] }))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes display-name addresses without Gmail alias rewriting", async () => {
    const rawBody = rawReceived({
      from: "John Doe <John@Example.COM>",
      to: ["Sales Desk <sales@acme.example>"],
    });
    const result = await verify(rawBody);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe("john@example.com");
      expect(result.event.to).toBe(MAILBOX);
    }

    const gmailBody = rawReceived({ from: "first.last+tag@gmail.com" });
    const gmail = await verify(gmailBody);
    expect(gmail.status).toBe("inbound");
    if (gmail.status === "inbound") {
      expect(gmail.event.from).toBe("first.last+tag@gmail.com");
    }
  });

  it("fails closed when the signing secret is missing", async () => {
    loadSecrets.mockResolvedValueOnce(null);
    await expect(verify(rawReceived())).rejects.toBeInstanceOf(
      AuthenticationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when the provider access token is missing on received events", async () => {
    loadSecrets.mockResolvedValueOnce({
      webhookSecret: SVIX_SECRET,
      providerAccessToken: null,
      webhookVerifyToken: null,
    });
    await expect(verify(rawReceived())).rejects.toBeInstanceOf(
      AuthenticationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not require an access token for ignored event types", async () => {
    loadSecrets.mockResolvedValueOnce({
      webhookSecret: SVIX_SECRET,
      providerAccessToken: null,
      webhookVerifyToken: null,
    });
    const rawBody = JSON.stringify({ type: "email.delivered", data: {} });
    await expect(verify(rawBody)).resolves.toEqual({ status: "ignored" });
  });

  it("rejects a non-email account", async () => {
    await expect(
      adapter.verifyAndParse({
        channelAccountId: ACCOUNT_ID,
        account: { ...account, channel: "whatsapp" },
        rawBody: rawReceived(),
        headers: signedHeaders(rawReceived()),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not verify against the access token", async () => {
    loadSecrets.mockResolvedValueOnce({
      webhookSecret: ACCESS_TOKEN.slice(0, 32),
      providerAccessToken: ACCESS_TOKEN,
      webhookVerifyToken: null,
    });
    await expect(verify(rawReceived())).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("does not accept WhatsApp or test HMAC headers", async () => {
    const headers = new Headers();
    headers.set("x-hub-signature-256", "sha256=abcd");
    headers.set("x-vg-signature", "deadbeef");
    headers.set("x-vg-timestamp", TIMESTAMP);
    await expect(verify(rawReceived(), headers)).rejects.toBeInstanceOf(
      AuthenticationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a destination that does not match the account mailbox before Receiving API", async () => {
    const rawBody = rawReceived({ to: ["other@example.com"] });
    await expect(verify(rawBody)).rejects.toBeInstanceOf(AuthenticationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON after a valid signature", async () => {
    const rawBody = "{not-json";
    await expect(verify(rawBody, signedHeaders(rawBody))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps Receiving API 401 and 403 to generic 401", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(401, { message: "no" }));
    await expect(verify(rawReceived())).rejects.toBeInstanceOf(
      AuthenticationError
    );
    fetchImpl.mockResolvedValueOnce(jsonResponse(403, { message: "no" }));
    await expect(verify(rawReceived())).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  it("does not persist a fake inbound when Receiving API is non-2xx or unreadable", async () => {
    fetchImpl.mockResolvedValueOnce(jsonResponse(500, { message: "down" }));
    await expect(verify(rawReceived())).rejects.toThrow(
      "Failed to load received email"
    );
    fetchImpl.mockResolvedValueOnce(
      new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } })
    );
    await expect(verify(rawReceived())).resolves.toEqual({ status: "ignored" });
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { text: "   " }));
    await expect(verify(rawReceived())).resolves.toEqual({ status: "ignored" });
  });

  it("strips spoofed organization/user/lead identifiers from the canonical event", async () => {
    const rawBody = JSON.stringify({
      ...receivedPayload(),
      organizationId: "bbbbbbbb-0000-0000-0000-000000000002",
      userId: "ffffffff-0000-4000-8000-000000000099",
      leadId: "11111111-1111-4111-8111-111111111111",
    });
    const result = await verify(rawBody);
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event).not.toHaveProperty("organizationId");
      expect(result.event).not.toHaveProperty("userId");
      expect(result.event).not.toHaveProperty("leadId");
    }
  });

  it("exports the default adapter used by the static registry", () => {
    expect(emailInboundAdapter).toBeDefined();
    expect(typeof emailInboundAdapter.verifyAndParse).toBe("function");
  });
});
