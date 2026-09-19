import { MockAiProvider } from "@/modules/ai/providers/mock";
import { createOpenAiProviderFromEnv } from "@/modules/ai/providers/openai";
import { AiProviderError } from "@/modules/ai/errors";
import type { AiProvider } from "@/modules/ai/providers/types";

function isProductionLikeRuntime(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "production" || vercelEnv === "preview") {
    return true;
  }
  return process.env.NODE_ENV === "production";
}

export function createAiProvider(): AiProvider {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === "mock") {
    return new MockAiProvider();
  }
  if (configured === "openai" || process.env.OPENAI_API_KEY) {
    return createOpenAiProviderFromEnv();
  }
  if (isProductionLikeRuntime()) {
    throw new AiProviderError("AI provider is not configured.");
  }
  return new MockAiProvider();
}
