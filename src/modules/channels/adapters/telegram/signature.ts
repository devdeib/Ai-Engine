/**
 * Telegram webhook secret-token verification.
 * Compares X-Telegram-Bot-Api-Secret-Token to the stored webhook_secret.
 * The Bot Token is never used as the webhook secret.
 */
import { signaturesMatch } from "@/modules/channels/hmac";
import { TELEGRAM_SECRET_TOKEN_HEADER } from "@/modules/channels/adapters/telegram/constants";

export function readTelegramSecretTokenHeader(
  headers: { get(name: string): string | null }
): string | null {
  const value = headers.get(TELEGRAM_SECRET_TOKEN_HEADER)?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function telegramSecretTokensMatch(
  expected: string,
  provided: string
): boolean {
  return signaturesMatch(expected, provided);
}
