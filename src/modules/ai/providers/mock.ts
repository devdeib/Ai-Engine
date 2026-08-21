/**
 * Test/default provider. Never calls a network LLM.
 */
import type { AiProvider } from "@/modules/ai/providers/types";
import type { AiProviderRequest, AiProviderResponse } from "@/modules/ai/types";

export class MockAiProvider implements AiProvider {
  readonly name = "mock";

  constructor(private readonly cannedText?: string) {}

  async generateResponse(
    input: AiProviderRequest
  ): Promise<AiProviderResponse> {
    if (this.cannedText !== undefined) {
      return { text: this.cannedText };
    }
    const firstName = input.context.lead.firstName.trim() || "there";
    return {
      text: `Thanks for your message, ${firstName}. A specialist will follow up with accurate details shortly.`,
    };
  }
}
