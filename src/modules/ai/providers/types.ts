import { AiMalformedResponseError } from "@/modules/ai/errors";
import type {
  AiAnalysisRequest,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderTurn,
} from "@/modules/ai/types";

export interface AiProvider {
  readonly name: string;
  generateResponse(input: AiProviderRequest): Promise<AiProviderResponse>;
  generateSalesAnalysis?(input: AiAnalysisRequest): Promise<unknown>;
}

export function normalizeProviderTurn(raw: unknown): AiProviderTurn {
  if (!raw || typeof raw !== "object") {
    throw new AiMalformedResponseError();
  }
  const record = raw as Record<string, unknown>;
  if (record.type === "tool_call") {
    if (typeof record.name !== "string" || record.name.length === 0) {
      throw new AiMalformedResponseError();
    }
    return {
      type: "tool_call",
      id: typeof record.id === "string" && record.id.length > 0 ? record.id : "tool-call",
      name: record.name,
      arguments: record.arguments,
    };
  }
  if (typeof record.text === "string") {
    return { type: "text", text: record.text };
  }
  throw new AiMalformedResponseError();
}
