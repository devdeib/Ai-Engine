import { describe, it, expect } from "vitest";
import {
  classifyEmailHttpError,
  classifyEmailNetworkError,
} from "@/modules/channels/adapters/email/errors";

describe("Email delivery error mapping", () => {
  it("maps timeout and network failures as retryable", () => {
    const timeout = new Error("aborted");
    timeout.name = "TimeoutError";
    expect(classifyEmailNetworkError(timeout)).toEqual({
      errorCode: "TIMEOUT",
      retryable: true,
    });
    expect(classifyEmailNetworkError(new TypeError("fetch failed"))).toEqual({
      errorCode: "NETWORK_ERROR",
      retryable: true,
    });
  });

  it("maps 408, 429, and 5xx as retryable", () => {
    expect(classifyEmailHttpError(408, null).retryable).toBe(true);
    expect(classifyEmailHttpError(429, null).retryable).toBe(true);
    expect(classifyEmailHttpError(500, null).retryable).toBe(true);
    expect(
      classifyEmailHttpError(429, { name: "rate_limit_exceeded" })
    ).toEqual({ errorCode: "RATE_LIMITED", retryable: true });
  });

  it("maps auth and validation failures as terminal", () => {
    expect(classifyEmailHttpError(401, { name: "invalid_api_key" })).toEqual({
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });
    expect(classifyEmailHttpError(403, null)).toEqual({
      errorCode: "FORBIDDEN",
      retryable: false,
    });
    expect(classifyEmailHttpError(400, null)).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
    expect(classifyEmailHttpError(422, null)).toEqual({
      errorCode: "MALFORMED_REQUEST",
      retryable: false,
    });
    expect(classifyEmailHttpError(404, { name: "not_found" })).toEqual({
      errorCode: "INVALID_DESTINATION",
      retryable: false,
    });
  });

  it("treats unknown 4xx as terminal and unknown 5xx as retryable", () => {
    expect(classifyEmailHttpError(418, null)).toEqual({
      errorCode: "HTTP_418",
      retryable: false,
    });
    expect(classifyEmailHttpError(599, null)).toEqual({
      errorCode: "HTTP_599",
      retryable: true,
    });
  });
});
