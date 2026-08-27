/**
 * AI-layer errors. Messages are safe to return to API clients — no provider
 * internals, keys, prompts, or stack traces.
 */
import { AppError } from "@/lib/errors";

export class AiProviderError extends AppError {
  constructor(message = "The AI provider is unavailable. Please try again.") {
    super("AI_PROVIDER_ERROR", message, 502);
    this.name = "AiProviderError";
  }
}

export class AiMalformedResponseError extends AppError {
  constructor(message = "The AI provider returned an unusable response.") {
    super("AI_MALFORMED_RESPONSE", message, 502);
    this.name = "AiMalformedResponseError";
  }
}

export type AiToolErrorCode =
  | "AI_UNKNOWN_TOOL"
  | "AI_TOOL_INVALID_ARGUMENTS"
  | "AI_TOOL_NOT_FOUND"
  | "AI_TOOL_LIMIT_EXCEEDED"
  | "AI_TOOL_FAILED"
  | "AI_TOOL_REJECTED";

export class AiToolError extends AppError {
  constructor(
    code: AiToolErrorCode,
    message = "The AI tool request could not be completed."
  ) {
    super(code, message, code === "AI_TOOL_LIMIT_EXCEEDED" ? 422 : 502);
    this.name = "AiToolError";
  }
}
