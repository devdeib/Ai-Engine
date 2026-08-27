/**
 * Analysis-layer errors. These MUST NOT extend AiProviderError — the worker
 * must not retry the AI job because analysis failed.
 */
export type AiSalesAnalysisErrorCode =
  | "AI_MALFORMED_ANALYSIS"
  | "AI_PROVIDER_ERROR";

export class AiSalesAnalysisError extends Error {
  readonly code: AiSalesAnalysisErrorCode;

  constructor(code: AiSalesAnalysisErrorCode) {
    super("The sales analysis could not be completed.");
    this.name = "AiSalesAnalysisError";
    this.code = code;
  }
}
