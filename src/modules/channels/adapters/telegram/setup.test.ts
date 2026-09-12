import { describe, it, expect, vi, beforeEach } from "vitest";
import { logger } from "@/lib/logger";
import {
  TELEGRAM_BOT_API_HOST,
  TELEGRAM_ALLOWED_UPDATES,
} from "@/modules/channels/adapters/telegram/constants";
import { registerTelegramWebhook } from "@/modules/channels/adapters/telegram/setup";

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const BOT_TOKEN = "123456:AA" + "t".repeat(30);
const SECRET = "s".repeat(64);
const WEBHOOK_URL =
  "https://app.example.com/api/v1/channels/accounts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/webhook";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("registerTelegramWebhook", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls setWebhook with url, secret_token, and message updates only", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(200, { ok: true, result: true }));
    await expect(
      registerTelegramWebhook({
        accessToken: BOT_TOKEN,
        secretToken: SECRET,
        webhookUrl: WEBHOOK_URL,
        fetchImpl,
      })
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${TELEGRAM_BOT_API_HOST}/bot${BOT_TOKEN}/setWebhook`);
    expect(JSON.parse(String(init.body))).toEqual({
      url: WEBHOOK_URL,
      secret_token: SECRET,
      allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    });
  });

  it("is safe to execute more than once", async () => {
    fetchImpl.mockResolvedValue(jsonResponse(200, { ok: true, result: true }));
    await registerTelegramWebhook({
      accessToken: BOT_TOKEN,
      secretToken: SECRET,
      webhookUrl: WEBHOOK_URL,
      fetchImpl,
    });
    await registerTelegramWebhook({
      accessToken: BOT_TOKEN,
      secretToken: SECRET,
      webhookUrl: WEBHOOK_URL,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not log the bot token or secret token", async () => {
    fetchImpl.mockRejectedValue(new TypeError("fetch failed"));
    await registerTelegramWebhook({
      accessToken: BOT_TOKEN,
      secretToken: SECRET,
      webhookUrl: WEBHOOK_URL,
      fetchImpl,
    });
    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain(BOT_TOKEN);
    expect(logged).not.toContain(SECRET);
  });

  it("maps an invalid bot token without exposing it", async () => {
    fetchImpl.mockResolvedValue(
      jsonResponse(401, { ok: false, error_code: 401, description: "Unauthorized" })
    );
    await expect(
      registerTelegramWebhook({
        accessToken: BOT_TOKEN,
        secretToken: SECRET,
        webhookUrl: WEBHOOK_URL,
        fetchImpl,
      })
    ).resolves.toEqual({ ok: false, errorCode: "TELEGRAM_HTTP_401" });
  });
});
