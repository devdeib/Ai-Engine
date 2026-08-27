/**
 * Deterministic WhatsApp Cloud API delivery error mapping.
 * Adapter retryable is authoritative to the delivery worker.
 * Never include tokens, signatures, or raw payloads in error codes.
 */

export interface WhatsAppClassifiedError {
  errorCode: string;
  retryable: boolean;
}

const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_GRAPH_CODES = new Set([4, 80007, 130429]);
const TERMINAL_GRAPH_CODES: Record<number, string> = {
  100: "INVALID_PARAMETER",
  33: "MALFORMED_REQUEST",
  190: "INVALID_ACCESS_TOKEN",
  368: "FORBIDDEN",
  131009: "INVALID_DESTINATION",
  131021: "INVALID_DESTINATION",
  131026: "INVALID_DESTINATION",
  131047: "UNSUPPORTED_MESSAGE",
  131051: "UNSUPPORTED_MESSAGE",
};

function graphErrorCode(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: { code?: unknown } }).error;
  if (!error) return null;
  if (typeof error.code === "number" && Number.isFinite(error.code)) {
    return error.code;
  }
  if (typeof error.code === "string" && /^\d+$/.test(error.code)) {
    return Number(error.code);
  }
  return null;
}

export function classifyWhatsAppNetworkError(error: unknown): WhatsAppClassifiedError {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return { errorCode: "TIMEOUT", retryable: true };
    }
  }
  return { errorCode: "NETWORK_ERROR", retryable: true };
}

export function classifyWhatsAppHttpError(
  status: number,
  body: unknown
): WhatsAppClassifiedError {
  const graphCode = graphErrorCode(body);
  if (graphCode !== null && RETRYABLE_GRAPH_CODES.has(graphCode)) {
    return { errorCode: `GRAPH_${graphCode}`, retryable: true };
  }
  if (graphCode !== null && TERMINAL_GRAPH_CODES[graphCode]) {
    return { errorCode: TERMINAL_GRAPH_CODES[graphCode], retryable: false };
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
