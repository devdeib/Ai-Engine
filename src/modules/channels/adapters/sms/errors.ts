/**
 * Deterministic Telnyx delivery error mapping.
 * Adapter retryable is authoritative to the worker.
 * Never include tokens, signatures, or raw payloads in error codes.
 */

export interface SmsClassifiedError {
  errorCode: string;
  retryable: boolean;
}

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

function telnyxErrorEntry(body: unknown): { code: string | null; title: string | null } {
  if (typeof body !== "object" || body === null) {
    return { code: null, title: null };
  }
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return { code: null, title: null };
  }
  const first = errors[0];
  if (typeof first !== "object" || first === null) {
    return { code: null, title: null };
  }
  const record = first as { code?: unknown; title?: unknown; detail?: unknown };
  let code: string | null = null;
  if (typeof record.code === "string" && record.code.trim().length > 0) {
    code = record.code.trim();
  } else if (typeof record.code === "number" && Number.isFinite(record.code)) {
    code = String(record.code);
  }
  const titleParts = [record.title, record.detail]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const title = titleParts.trim().length > 0 ? titleParts.trim() : null;
  return { code, title };
}

export function classifySmsNetworkError(error: unknown): SmsClassifiedError {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { errorCode: "TIMEOUT", retryable: true };
    }
  }
  return { errorCode: "NETWORK_ERROR", retryable: true };
}

export function classifySmsHttpError(
  status: number,
  body: unknown
): SmsClassifiedError {
  const { code, title } = telnyxErrorEntry(body);
  const combined = `${code ?? ""} ${title ?? ""}`.toLowerCase();

  if (/rate.?limit/.test(combined) || status === 429) {
    return { errorCode: "RATE_LIMITED", retryable: true };
  }
  if (
    /invalid.?api.?key|restricted.?api.?key/.test(combined) ||
    code === "10011" ||
    code === "10009"
  ) {
    return { errorCode: "INVALID_ACCESS_TOKEN", retryable: false };
  }
  if (/not_found|not found/.test(combined) || code === "10015" || code === "40322") {
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
