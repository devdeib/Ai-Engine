/**
 * OpenAI Chat Completions via fetch. No SDK dependency.
 * Native tool_calls are mapped to the provider-independent turn model here.
 */
import "server-only";
import { AiMalformedResponseError, AiProviderError } from "@/modules/ai/errors";
import { AiSalesAnalysisError } from "@/modules/ai/analysis/errors";
import {
  AI_SALES_ANALYSIS_MAX_OUTPUT_TOKENS,
  AI_SALES_ANALYSIS_TIMEOUT_MS,
} from "@/modules/ai/analysis/constants";
import { AI_SALES_ANALYSIS_JSON_SCHEMA } from "@/modules/ai/analysis/schema";
import { buildSalesAnalysisUserMessage } from "@/modules/ai/analysis/prompt";
import type { AiProvider } from "@/modules/ai/providers/types";
import type {
  AiAnalysisRequest,
  AiProviderHistoryItem,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderTurn,
  AiToolDescriptor,
} from "@/modules/ai/types";
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
        body: JSON.stringify(buildOpenAiRequestBody(input, this.model, this.maxTokens)),
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

    return mapOpenAiPayloadToTurn(payload);
  }

  async generateSalesAnalysis(input: AiAnalysisRequest): Promise<unknown> {
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
          temperature: 0,
          max_tokens: AI_SALES_ANALYSIS_MAX_OUTPUT_TOKENS,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "ai_sales_analysis_v1",
              strict: true,
              schema: AI_SALES_ANALYSIS_JSON_SCHEMA,
            },
          },
          messages: [
            { role: "system", content: input.systemPrompt },
            {
              role: "user",
              content: buildSalesAnalysisUserMessage(input.context, input.draftReply),
            },
          ],
        }),
        signal: AbortSignal.timeout(AI_SALES_ANALYSIS_TIMEOUT_MS),
      });
    } catch {
      throw new AiSalesAnalysisError("AI_PROVIDER_ERROR");
    }

    if (!response.ok) {
      throw new AiSalesAnalysisError("AI_PROVIDER_ERROR");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
    }

    return parseOpenAiAnalysisPayload(payload);
  }
}

function buildOpenAiRequestBody(
  input: AiProviderRequest,
  model: string,
  maxTokens: number
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    temperature: 0.5,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: buildSalesAgentUserMessage(input.context) },
      ...mapHistoryToOpenAiMessages(input.history ?? []),
    ],
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools.map(toOpenAiTool);
    body.tool_choice = "auto";
  }
  return body;
}

function toOpenAiTool(tool: AiToolDescriptor): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputJsonSchema,
    },
  };
}

function mapHistoryToOpenAiMessages(
  history: AiProviderHistoryItem[]
): Record<string, unknown>[] {
  const messages: Record<string, unknown>[] = [];
  for (const item of history) {
    if (item.role === "assistant") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: item.turn.id,
            type: "function",
            function: {
              name: item.turn.name,
              arguments: JSON.stringify(item.turn.arguments ?? {}),
            },
          },
        ],
      });
    } else {
      messages.push({
        role: "tool",
        tool_call_id: item.id,
        content: JSON.stringify(item.result),
      });
    }
  }
  return messages;
}

function mapOpenAiPayloadToTurn(payload: unknown): AiProviderTurn {
  if (!payload || typeof payload !== "object") {
    throw new AiMalformedResponseError();
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiMalformedResponseError();
  }
  const message = (choices[0] as { message?: Record<string, unknown> }).message;
  if (!message || typeof message !== "object") {
    throw new AiMalformedResponseError();
  }

  const toolCalls = message.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    return mapOpenAiToolCall(toolCalls[0]);
  }

  const text = extractOpenAiText(message.content);
  return { type: "text", text: sanitizeAiReply(text) };
}

function mapOpenAiToolCall(raw: unknown): Extract<AiProviderTurn, { type: "tool_call" }> {
  if (!raw || typeof raw !== "object") {
    throw new AiMalformedResponseError();
  }
  const call = raw as {
    id?: unknown;
    function?: { name?: unknown; arguments?: unknown };
  };
  if (typeof call.function?.name !== "string" || call.function.name.length === 0) {
    throw new AiMalformedResponseError();
  }
  let args: unknown = {};
  if (typeof call.function.arguments === "string") {
    try {
      args = JSON.parse(call.function.arguments) as unknown;
    } catch {
      args = call.function.arguments;
    }
  } else if (call.function.arguments !== undefined) {
    args = call.function.arguments;
  }
  return {
    type: "tool_call",
    id: typeof call.id === "string" && call.id.length > 0 ? call.id : "tool-call",
    name: call.function.name,
    arguments: args,
  };
}

function extractOpenAiText(content: unknown): string {
  if (typeof content !== "string") {
    throw new AiMalformedResponseError();
  }
  return content;
}

function parseOpenAiAnalysisPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
  }
  const message = (choices[0] as { message?: Record<string, unknown> }).message;
  if (!message || typeof message !== "object") {
    throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
  }
  const content = message.content;
  if (typeof content === "object" && content !== null) {
    return content;
  }
  if (typeof content !== "string") {
    throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS");
  }
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
