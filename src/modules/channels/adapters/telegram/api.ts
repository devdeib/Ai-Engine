/**
 * Telegram Bot API HTTP helper. Host is fixed to api.telegram.org.
 * Callers must never log the request URL (it embeds the bot token).
 */
import "server-only";
import {
  TELEGRAM_BOT_API_TIMEOUT_MS,
  telegramBotMethodUrl,
} from "@/modules/channels/adapters/telegram/constants";

type FetchFn = typeof fetch;

export async function callTelegramBotMethod(input: {
  accessToken: string;
  method: string;
  body: Record<string, unknown>;
  fetchImpl?: FetchFn;
}): Promise<{ status: number; body: unknown }> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const url = telegramBotMethodUrl(input.accessToken, input.method);
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
    signal: AbortSignal.timeout(TELEGRAM_BOT_API_TIMEOUT_MS),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  return { status: response.status, body: parsed };
}

export function telegramApiOk(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { ok?: unknown }).ok === true;
}
