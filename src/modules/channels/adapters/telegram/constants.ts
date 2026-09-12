/**
 * Telegram Bot API configuration. Host is isolated here so it is not
 * scattered through adapters. Tests do not require env overrides.
 */
export const TELEGRAM_BOT_API_HOST = "https://api.telegram.org";
export const TELEGRAM_BOT_API_TIMEOUT_MS = 15_000;
export const TELEGRAM_SECRET_TOKEN_HEADER = "x-telegram-bot-api-secret-token";
export const TELEGRAM_ALLOWED_UPDATES = ["message"] as const;

export function telegramBotMethodUrl(accessToken: string, method: string): string {
  return `${TELEGRAM_BOT_API_HOST}/bot${accessToken}/${encodeURIComponent(method)}`;
}
