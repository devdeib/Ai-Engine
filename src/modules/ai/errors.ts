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
