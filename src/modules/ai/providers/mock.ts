/**
 * Test/default provider. Never calls a network LLM.
 * Optional scripted turns enable deterministic tool-call tests.
 */
import type { AiProvider } from "@/modules/ai/providers/types";
import type {
  AiAnalysisRequest,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderTurn,
} from "@/modules/ai/types";

export const MOCK_SALES_ANALYSIS = {
  inboundIntent: "general_question" as const,
  objection: "none" as const,
  urgency: "unknown" as const,
  qualification: "unknown" as const,
  inferredStage: "exploring" as const,
  buyingSignals: [] as const,
  missingInformation: [] as const,
  nextBestAction: "provide_information" as const,
  rationale: "Default mock analysis for tests.",
  confidence: 0.5,
};

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  private scriptIndex = 0;

  constructor(
    private readonly cannedText?: string,
    private readonly script: AiProviderTurn[] = [],
    private readonly analysis: unknown = MOCK_SALES_ANALYSIS
  ) {}

  async generateResponse(
    input: AiProviderRequest
  ): Promise<AiProviderResponse> {
    if (this.scriptIndex < this.script.length) {
      const turn = this.script[this.scriptIndex];
      this.scriptIndex += 1;
      if (turn) {
        return turn;
      }
    }
    if (this.cannedText !== undefined) {
      return { type: "text", text: this.cannedText };
    }
    const firstName = input.context.lead.firstName.trim() || "there";
    return {
      type: "text",
      text: `Thanks for your message, ${firstName}. A specialist will follow up with accurate details shortly.`,
    };
  }

  async generateSalesAnalysis(_input: AiAnalysisRequest): Promise<unknown> {
    return this.analysis;
  }
}
