import { describe, it, expect } from "vitest";
import {
  classifyTelegramHttpError,
  classifyTelegramNetworkError,
} from "@/modules/channels/adapters/telegram/errors";

describe("Telegram delivery error mapping", () => {
  it("maps timeout and network failures as retryable", () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    expect(classifyTelegramNetworkError(timeout)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyTelegramNetworkError(abort)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    expect(classifyTelegramNetworkError(new TypeError("fetch failed"))).toEqual({
      errorCode: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("maps transient HTTP statuses as retryable", () => {
    expect(classifyTelegramHttpError(429, { error_code: 429 })).toEqual({
      errorCode: "HTTP_429",
      retryable: true,
    });
    expect(classifyTelegramHttpError(500, { ok: false })).toEqual({
      errorCode: "HTTP_500",
      retryable: true,
    });
    expect(classifyTelegramHttpError(502, null)).toEqual({
      errorCode: "HTTP_502",
      retryable: true,
    });
  });

  it("maps auth and blocked-user failures as terminal", () => {
    expect(classifyTelegramHttpError(401, { error_code: 401 })).toEqual({
      errorCode: "TELEGRAM_HTTP_401",
      retryable: false,
      telegramHttpStatus: 401,
      telegramApiErrorCode: 401,
    });
    expect(classifyTelegramHttpError(200, { error_code: 401 })).toEqual({
      errorCode: "TELEGRAM_HTTP_401",
      retryable: false,
      telegramHttpStatus: 200,
      telegramApiErrorCode: 401,
    });
    expect(classifyTelegramHttpError(401, null)).toEqual({
      errorCode: "TELEGRAM_HTTP_401",
      retryable: false,
      telegramHttpStatus: 401,
    });
    expect(
      classifyTelegramHttpError(403, {
        error_code: 403,
        description: "Forbidden: bot was blocked by the user",
      })
    ).toEqual({ errorCode: "FORBIDDEN", retryable: false });
  });

  it("maps invalid chat ids and malformed requests as terminal", () => {
    expect(
      classifyTelegramHttpError(400, {
        error_code: 400,
        description: "Bad Request: chat not found",
      })
    ).toEqual({ errorCode: "INVALID_DESTINATION", retryable: false });
    expect(classifyTelegramHttpError(400, { error_code: 400 })).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
  });
});
