import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";
import { createSmsDeliveryAdapter } from "@/modules/channels/adapters/sms/delivery";
import { telnyxMessagesUrl } from "@/modules/channels/adapters/sms/constants";
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
const FROM = "+17735550001";
const DEST = "+17735550002";
const ACCESS_TOKEN = "KEY" + "t".repeat(40);
const BODY = "Hello from VG";
const PROVIDER_ID = "403193d5-6802-43c2-bd39-10487abff809";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smsDeliveryAdapter", () => {
  const fetchImpl = vi.fn();
  const loadCredentials = vi.fn();
  const adapter = createSmsDeliveryAdapter({ fetchImpl, loadCredentials });

  beforeEach(() => {
    vi.clearAllMocks();
    loadCredentials.mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      destination: FROM,
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

  it("sends plain text and returns Telnyx data.id", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(200, { data: { id: PROVIDER_ID } }));

    const result = await adapter.send(sendInput());

    expect(result).toEqual({
      ok: true,
      providerMessageId: PROVIDER_ID,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(telnyxMessagesUrl());
    expect(url).toBe("https://api.telnyx.com/v2/messages");
    expect(url).not.toContain(ACCESS_TOKEN);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(init.headers).not.toHaveProperty("Idempotency-Key");
    expect(JSON.parse(String(init.body))).toEqual({
      from: FROM,
      to: DEST,
      text: BODY,
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("api_key");
  });

  it("keeps the same generic messageId idempotency key on retries", async () => {
    fetchImpl.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, { data: { id: PROVIDER_ID } }))
    );
    const first = sendInput();
    const second = sendInput();
    await adapter.send(first);
    await adapter.send(second);
    expect(first.idempotencyKey).toBe(MSG_1);
    expect(second.idempotencyKey).toBe(MSG_1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const call of fetchImpl.mock.calls) {
      const headers = call[1].headers as Record<string, string>;
      expect(headers).not.toHaveProperty("Idempotency-Key");
      expect(call[0]).not.toContain(ACCESS_TOKEN);
    }
  });

  it("does not log the access token", async () => {
    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    await adapter.send(sendInput());
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toContain("Bearer");
  });

  it("treats a 2xx response without data.id as terminal", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(200, { data: { record_type: "message" } }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
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
    fetchImpl.mockResolvedValueOnce(jsonResponse(408, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "HTTP_408",
      retryable: true,
    });
    fetchImpl.mockResolvedValueOnce(jsonResponse(429, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "RATE_LIMITED",
      retryable: true,
    });
    fetchImpl.mockResolvedValueOnce(jsonResponse(503, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "HTTP_503",
      retryable: true,
    });
  });

  it("maps terminal auth and configuration errors without retrying", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(401, { errors: [{ code: "10011", title: "Invalid API key" }] })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(401, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "UNAUTHORIZED",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(403, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "FORBIDDEN",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(400, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(422, { errors: [] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(jsonResponse(404, { errors: [{ title: "not_found" }] }));
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_DESTINATION",
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
