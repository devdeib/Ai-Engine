/**
 * Deterministic Telegram Bot API delivery error mapping.
 * Adapter retryable is authoritative to the delivery worker.
 * Never include tokens, secret tokens, or raw payloads in error codes.
 */

export interface TelegramClassifiedError {
  errorCode: string;
  retryable: boolean;
  telegramHttpStatus?: number;
  telegramApiErrorCode?: number;
}

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

function telegramErrorCode(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const code = (body as { error_code?: unknown }).error_code;
  if (typeof code === "number" && Number.isFinite(code)) {
    return code;
  }
  if (typeof code === "string" && /^\d+$/.test(code)) {
    return Number(code);
  }
  return null;
}

function telegramDescription(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const description = (body as { description?: unknown }).description;
  return typeof description === "string" ? description.toLowerCase() : "";
}

export function classifyTelegramNetworkError(error: unknown): TelegramClassifiedError {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { errorCode: "TIMEOUT", retryable: true };
    }
  }
  return { errorCode: "NETWORK_ERROR", retryable: true };
}

export function classifyTelegramHttpError(
  status: number,
  body: unknown
): TelegramClassifiedError {
  const apiCode = telegramErrorCode(body) ?? status;
  const description = telegramDescription(body);

  if (apiCode === 429 || status === 429) {
    return { errorCode: "HTTP_429", retryable: true };
  }
  if (RETRYABLE_HTTP.has(status) || (apiCode >= 500 && apiCode <= 599)) {
    return { errorCode: `HTTP_${status}`, retryable: true };
  }

  if (apiCode === 401 || status === 401) {
    const parsedApiCode = telegramErrorCode(body);
    const classified: TelegramClassifiedError = {
      errorCode: "TELEGRAM_HTTP_401",
      retryable: false,
      telegramHttpStatus: status,
    };
    if (parsedApiCode !== null) {
      classified.telegramApiErrorCode = parsedApiCode;
    }
    return classified;
  }
  if (
    apiCode === 403 ||
    status === 403 ||
    description.includes("blocked by the user") ||
    description.includes("user is deactivated")
  ) {
    return { errorCode: "FORBIDDEN", retryable: false };
  }
  if (
    description.includes("chat not found") ||
    description.includes("chat_id is empty") ||
    description.includes("peer_id_invalid")
  ) {
    return { errorCode: "INVALID_DESTINATION", retryable: false };
  }
  if (status === 404) {
    return { errorCode: "INVALID_DESTINATION", retryable: false };
  }
  if (status === 400 || status === 422 || apiCode === 400) {
    return { errorCode: "MALFORMED_REQUEST", retryable: false };
  }

  return { errorCode: `HTTP_${status}`, retryable: false };
}
