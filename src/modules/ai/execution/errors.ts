/**
 * Execution-gate errors. MUST NOT extend AiProviderError — the worker must
 * not retry the AI job because Phase 4.8 execution failed.
 */
export type AiSalesRecommendationExecutionErrorCode =
  "AI_RECOMMENDATION_EXECUTION_FAILED";

export class AiSalesRecommendationExecutionError extends Error {
  readonly code: AiSalesRecommendationExecutionErrorCode;

  constructor(
    code: AiSalesRecommendationExecutionErrorCode = "AI_RECOMMENDATION_EXECUTION_FAILED"
  ) {
    super("The sales recommendation could not be executed.");
    this.name = "AiSalesRecommendationExecutionError";
    this.code = code;
  }
}
