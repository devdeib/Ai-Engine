import { describe, it, expect } from "vitest";
import {
  classifyWhatsAppHttpError,
  classifyWhatsAppNetworkError,
} from "@/modules/channels/adapters/whatsapp/errors";

describe("WhatsApp delivery error mapping", () => {
  it("maps timeout and network failures as retryable", () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    expect(classifyWhatsAppNetworkError(timeout)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyWhatsAppNetworkError(abort)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    expect(classifyWhatsAppNetworkError(new TypeError("fetch failed"))).toEqual({
      errorCode: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("maps transient HTTP statuses as retryable", () => {
    expect(classifyWhatsAppHttpError(408, null)).toEqual({
      errorCode: "HTTP_408",
      retryable: true,
    });
    expect(classifyWhatsAppHttpError(429, null)).toEqual({
      errorCode: "HTTP_429",
      retryable: true,
    });
    expect(classifyWhatsAppHttpError(500, null)).toEqual({
      errorCode: "HTTP_500",
      retryable: true,
    });
    expect(classifyWhatsAppHttpError(502, null)).toEqual({
      errorCode: "HTTP_502",
      retryable: true,
    });
    expect(classifyWhatsAppHttpError(503, null)).toEqual({
      errorCode: "HTTP_503",
      retryable: true,
    });
  });

  it("maps auth and configuration failures as terminal", () => {
    expect(
      classifyWhatsAppHttpError(401, { error: { code: 190 } })
    ).toEqual({ errorCode: "INVALID_ACCESS_TOKEN", retryable: false });
    expect(
      classifyWhatsAppHttpError(401, { error: { code: "190" } })
    ).toEqual({ errorCode: "INVALID_ACCESS_TOKEN", retryable: false });
    expect(classifyWhatsAppHttpError(401, null)).toEqual({
      errorCode: "UNAUTHORIZED",
      retryable: false,
    });
    expect(classifyWhatsAppHttpError(403, null)).toEqual({
      errorCode: "FORBIDDEN",
      retryable: false,
    });
  });

  it("maps invalid destination, malformed, and unsupported messages as terminal", () => {
    expect(
      classifyWhatsAppHttpError(400, { error: { code: 131026 } })
    ).toEqual({ errorCode: "INVALID_DESTINATION", retryable: false });
    expect(
      classifyWhatsAppHttpError(400, { error: { code: 100 } })
    ).toEqual({ errorCode: "INVALID_PARAMETER", retryable: false });
    expect(classifyWhatsAppHttpError(400, null)).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
    expect(
      classifyWhatsAppHttpError(400, { error: { code: 131051 } })
    ).toEqual({ errorCode: "UNSUPPORTED_MESSAGE", retryable: false });
  });
});
