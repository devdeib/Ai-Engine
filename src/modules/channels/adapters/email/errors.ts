/**
 * Deterministic Resend delivery error mapping for Phase 5.3B.
 * 5.3A does not send HTTP. Adapter retryable is authoritative to the worker.
 * Never include tokens, signatures, or raw payloads in error codes.
 */

export interface EmailClassifiedError {
  errorCode: string;
  retryable: boolean;
}

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

function resendErrorName(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const name = (body as { name?: unknown }).name;
  if (typeof name === "string" && name.trim().length > 0) {
    return name.trim();
  }
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && /rate limit/i.test(message)) {
    return "rate_limit_exceeded";
  }
  return null;
}

export function classifyEmailNetworkError(error: unknown): EmailClassifiedError {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { errorCode: "TIMEOUT", retryable: true };
    }
  }
  return { errorCode: "NETWORK_ERROR", retryable: true };
}

export function classifyEmailHttpError(
  status: number,
  body: unknown
): EmailClassifiedError {
  const name = resendErrorName(body);
  if (name === "rate_limit_exceeded") {
    return { errorCode: "RATE_LIMITED", retryable: true };
  }
  if (name === "invalid_api_key" || name === "restricted_api_key") {
    return { errorCode: "INVALID_ACCESS_TOKEN", retryable: false };
  }
  if (name === "validation_error" || name === "invalid_parameter") {
    return { errorCode: "MALFORMED_REQUEST", retryable: false };
  }
  if (name === "not_found") {
    return { errorCode: "INVALID_DESTINATION", retryable: false };
  }

  if (RETRYABLE_HTTP.has(status)) {
    return { errorCode: `HTTP_${status}`, retryable: true };
  }
  if (status === 401) {
    return { errorCode: "UNAUTHORIZED", retryable: false };
  }
  if (status === 403) {
    return { errorCode: "FORBIDDEN", retryable: false };
  }
  if (status === 404) {
    return { errorCode: "INVALID_DESTINATION", retryable: false };
  }
  if (status === 400 || status === 422) {
    return { errorCode: "MALFORMED_REQUEST", retryable: false };
  }
  if (status >= 500) {
    return { errorCode: `HTTP_${status}`, retryable: true };
  }
  return { errorCode: `HTTP_${status}`, retryable: false };
}
