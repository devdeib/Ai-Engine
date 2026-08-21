import { MockAiProvider } from "@/modules/ai/providers/mock";
import { createOpenAiProviderFromEnv } from "@/modules/ai/providers/openai";
import type { AiProvider } from "@/modules/ai/providers/types";

export function createAiProvider(): AiProvider {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (configured === "mock") {
    return new MockAiProvider();
  }
  if (configured === "openai" || process.env.OPENAI_API_KEY) {
    return createOpenAiProviderFromEnv();
  }
  return new MockAiProvider();
}
