import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";
import {
  WHATSAPP_GRAPH_API_HOST,
  whatsappGraphApiVersion,
} from "@/modules/channels/adapters/whatsapp/constants";
import { createWhatsAppDeliveryAdapter } from "@/modules/channels/adapters/whatsapp/delivery";
import { channelDeliveryIdempotencyKey } from "@/modules/channels/constants";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MSG_1 = "22222222-0000-4000-8000-0000000000bb";
const PHONE_NUMBER_ID = "123456789012345";
const ACCESS_TOKEN = "EAAG." + "t".repeat(180);
const DEST = "9745550001";
const BODY = "Hello from VG";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("whatsappDeliveryAdapter", () => {
  const fetchImpl = vi.fn();
  const loadCredentials = vi.fn();
  const adapter = createWhatsAppDeliveryAdapter({ fetchImpl, loadCredentials });

  beforeEach(() => {
    vi.clearAllMocks();
    loadCredentials.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
    });
  });

  function sendInput() {
    return {
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
      destination: DEST,
      body: BODY,
      idempotencyKey: channelDeliveryIdempotencyKey(MSG_1),
    };
  }

  it("sends a text message and returns the provider message id", async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: "wamid.OUT.1" }] })
    );

    const result = await adapter.send(sendInput());

    expect(result).toEqual({ ok: true, providerMessageId: "wamid.OUT.1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${WHATSAPP_GRAPH_API_HOST}/${whatsappGraphApiVersion()}/${PHONE_NUMBER_ID}/messages`
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      })
    );
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: DEST,
      type: "text",
      text: { preview_url: false, body: BODY },
    });
    expect(JSON.stringify(init.headers)).not.toMatch(/Idempotency/i);
  });

  it("receives the stable messageId idempotency key on every send", async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { messages: [{ id: "wamid.OUT.1" }] })
    );
    const first = sendInput();
    const second = sendInput();
    await adapter.send(first);
    await adapter.send(second);
    expect(first.idempotencyKey).toBe(MSG_1);
    expect(second.idempotencyKey).toBe(MSG_1);
  });

  it("does not log the access token", async () => {
    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    await adapter.send(sendInput());
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toContain("Bearer");
  });

  it("maps timeout and network errors as retryable", async () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    fetchImpl.mockRejectedValueOnce(timeout);
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "TIMEOUT",
      retryable: true,
    });

    fetchImpl.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("maps retryable HTTP statuses", async () => {
    for (const status of [408, 429, 500, 502, 503]) {
      fetchImpl.mockResolvedValueOnce(jsonResponse(status, { error: { message: "x" } }));
      await expect(adapter.send(sendInput())).resolves.toEqual({
        ok: false,
        errorCode: `HTTP_${status}`,
        retryable: true,
      });
    }
  });

  it("maps terminal auth and configuration errors without retrying", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 190, message: "Invalid token" } })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(401, { error: { message: "no" } }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "UNAUTHORIZED",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(403, { error: { message: "forbidden" } }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "FORBIDDEN",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 131026 } })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_DESTINATION",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(400, { error: { message: "bad" } }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(400, { error: { code: 131051 } })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "UNSUPPORTED_MESSAGE",
      retryable: false,
    });
  });

  it("fails closed when credentials cannot be loaded", async () => {
    loadCredentials.mockResolvedValueOnce(null);
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
