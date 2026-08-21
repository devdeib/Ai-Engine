import type { AiProviderRequest, AiProviderResponse } from "@/modules/ai/types";

export interface AiProvider {
  readonly name: string;
  generateResponse(input: AiProviderRequest): Promise<AiProviderResponse>;
}
