import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";
import {
  TELEGRAM_BOT_API_HOST,
} from "@/modules/channels/adapters/telegram/constants";
import { createTelegramDeliveryAdapter } from "@/modules/channels/adapters/telegram/delivery";
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
const BOT_TOKEN = "123456:AA" + "t".repeat(30);
const CHAT_ID = "1001234567";
const BODY = "Hello from VG";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("telegramDeliveryAdapter", () => {
  const fetchImpl = vi.fn();
  const loadCredentials = vi.fn();
  const adapter = createTelegramDeliveryAdapter({ fetchImpl, loadCredentials });

  beforeEach(() => {
    vi.clearAllMocks();
    loadCredentials.mockResolvedValue({
      accessToken: BOT_TOKEN,
    });
  });

  function sendInput() {
    return {
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      channelIdentityId: IDENTITY_ID,
      messageId: MSG_1,
      destination: CHAT_ID,
      body: BODY,
      idempotencyKey: channelDeliveryIdempotencyKey(MSG_1),
    };
  }

  it("sends a text message as chat_id/text and returns the provider message id", async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { ok: true, result: { message_id: 88, chat: { id: Number(CHAT_ID) } } })
    );

    const result = await adapter.send(sendInput());

    expect(result).toEqual({ ok: true, providerMessageId: "88" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TELEGRAM_BOT_API_HOST}/bot${BOT_TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: CHAT_ID,
      text: BODY,
    });
    expect(JSON.stringify(init.headers)).not.toMatch(/Authorization/i);
  });

  it("receives the stable messageId idempotency key on every send", async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse(200, { ok: true, result: { message_id: 88 } })
    );
    const first = sendInput();
    const second = sendInput();
    await adapter.send(first);
    await adapter.send(second);
    expect(first.idempotencyKey).toBe(MSG_1);
    expect(second.idempotencyKey).toBe(MSG_1);
  });

  it("does not log the bot token", async () => {
    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    await adapter.send(sendInput());
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain("123456:");
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

  it("maps Telegram rate limits as retryable", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(429, { ok: false, error_code: 429, description: "Too Many Requests: retry after 3" })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "HTTP_429",
      retryable: true,
    });
  });

  it("maps auth and invalid chat failures without retrying", async () => {
    fetchImpl.mockResolvedValueOnce(
      jsonResponse(401, { ok: false, error_code: 401, description: "Unauthorized" })
    );
    await expect(adapter.send(sendInput())).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });

    fetchImpl.mockResolvedValueOnce(
      jsonResponse(400, { ok: false, error_code: 400, description: "Bad Request: chat not found" })
    );
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
