/**
 * OpenAI Chat Completions via fetch. No SDK dependency.
 * Secrets stay in environment variables; never returned to callers.
 */
import "server-only";
import { AiMalformedResponseError, AiProviderError } from "@/modules/ai/errors";
import type { AiProvider } from "@/modules/ai/providers/types";
import type { AiProviderRequest, AiProviderResponse } from "@/modules/ai/types";
import {
  AI_DEFAULT_MAX_OUTPUT_TOKENS,
  AI_DEFAULT_TIMEOUT_MS,
} from "@/modules/ai/types";
import { buildSalesAgentUserMessage } from "@/modules/ai/prompts";
import { sanitizeAiReply } from "@/modules/ai/schema";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs = AI_DEFAULT_TIMEOUT_MS,
    private readonly maxTokens = AI_DEFAULT_MAX_OUTPUT_TOKENS
  ) {}

  async generateResponse(
    input: AiProviderRequest
  ): Promise<AiProviderResponse> {
    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          max_tokens: this.maxTokens,
          messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: buildSalesAgentUserMessage(input.context) },
          ],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiProviderError();
    }

    if (!response.ok) {
      throw new AiProviderError();
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiMalformedResponseError();
    }

    const text = extractOpenAiText(payload);
    return { text: sanitizeAiReply(text) };
  }
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new AiMalformedResponseError();
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiMalformedResponseError();
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (!message || typeof message.content !== "string") {
    throw new AiMalformedResponseError();
  }
  return message.content;
}

export function createOpenAiProviderFromEnv(): OpenAiProvider {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) {
    throw new AiProviderError("AI provider is not configured.");
  }
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const timeoutMs = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10);
  const maxTokens = Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS ?? "", 10);
  return new OpenAiProvider(
    apiKey,
    model,
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : AI_DEFAULT_TIMEOUT_MS,
    Number.isFinite(maxTokens) && maxTokens > 0
      ? maxTokens
      : AI_DEFAULT_MAX_OUTPUT_TOKENS
  );
}
