/**
 * Recommendation-layer errors. These MUST NOT extend AiProviderError — the
 * worker must not retry the AI job because recommendation failed.
 */
export type AiSalesRecommendationErrorCode = "AI_RECOMMENDATION_FAILED";

export class AiSalesRecommendationError extends Error {
  readonly code: AiSalesRecommendationErrorCode;

  constructor(code: AiSalesRecommendationErrorCode = "AI_RECOMMENDATION_FAILED") {
    super("The sales recommendation could not be completed.");
    this.name = "AiSalesRecommendationError";
    this.code = code;
  }
}
