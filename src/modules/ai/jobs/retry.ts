import {
  ConflictError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
  isAppError,
} from "@/lib/errors";
import { AiMalformedResponseError, AiProviderError, AiToolError } from "@/modules/ai/errors";
import { AiSalesAnalysisError } from "@/modules/ai/analysis/errors";
import { AiSalesRecommendationError } from "@/modules/ai/recommendation/errors";
import { AiSalesRecommendationExecutionError } from "@/modules/ai/execution/errors";

export function aiJobErrorCode(error: unknown): string {
  return isAppError(error) ? error.code : "INTERNAL_ERROR";
}

export function isRetryableAiJobError(error: unknown): boolean {
  if (error instanceof AiProviderError) return true;
  if (error instanceof AiMalformedResponseError) return false;
  if (error instanceof AiSalesAnalysisError) return false;
  if (error instanceof AiSalesRecommendationError) return false;
  if (error instanceof AiSalesRecommendationExecutionError) return false;
  if (error instanceof AiToolError) return false;
  if (error instanceof ConflictError) return false;
  if (error instanceof NotFoundError) return false;
  if (error instanceof TenantAccessError) return false;
  if (error instanceof ValidationError) return false;
  return true;
}
