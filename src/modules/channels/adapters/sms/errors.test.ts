import { describe, it, expect } from "vitest";
import {
  classifySmsHttpError,
  classifySmsNetworkError,
} from "@/modules/channels/adapters/sms/errors";

describe("SMS delivery error mapping", () => {
  it("maps timeout and network failures as retryable", () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    expect(classifySmsNetworkError(timeout)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    expect(classifySmsNetworkError(new TypeError("fetch failed"))).toEqual({
      errorCode: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("maps 408, 429, and 5xx as retryable", () => {
    expect(classifySmsHttpError(408, null)).toEqual({
      errorCode: "HTTP_408",
      retryable: true,
    });
    expect(classifySmsHttpError(429, null)).toEqual({
      errorCode: "RATE_LIMITED",
      retryable: true,
    });
    expect(classifySmsHttpError(500, null).retryable).toBe(true);
  });

  it("maps auth and validation failures as terminal", () => {
    expect(
      classifySmsHttpError(401, { errors: [{ code: "10011" }] })
    ).toEqual({
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });
    expect(classifySmsHttpError(401, null)).toEqual({
      errorCode: "UNAUTHORIZED",
      retryable: false,
    });
    expect(classifySmsHttpError(403, null)).toEqual({
      errorCode: "FORBIDDEN",
      retryable: false,
    });
    expect(classifySmsHttpError(400, null)).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
    expect(classifySmsHttpError(422, null)).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
    expect(classifySmsHttpError(404, { errors: [{ title: "not_found" }] })).toEqual({
      errorCode: "INVALID_DESTINATION",
      retryable: false,
    });
  });

  it("treats unknown 4xx as terminal and unknown 5xx as retryable", () => {
    expect(classifySmsHttpError(418, null)).toEqual({
      errorCode: "HTTP_418",
      retryable: false,
    });
    expect(classifySmsHttpError(599, null)).toEqual({
      errorCode: "HTTP_599",
      retryable: true,
    });
  });
});
