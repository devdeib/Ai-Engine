import { describe, it, expect } from "vitest";
import {
  ConflictError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import { AiMalformedResponseError, AiProviderError, AiToolError } from "@/modules/ai/errors";
import { AiSalesAnalysisError } from "@/modules/ai/analysis/errors";
import { AiSalesRecommendationError } from "@/modules/ai/recommendation/errors";
import { AiSalesRecommendationExecutionError } from "@/modules/ai/execution/errors";
import { aiJobErrorCode, isRetryableAiJobError } from "@/modules/ai/jobs/retry";
import { retryDelaySeconds } from "@/modules/ai/jobs/constants";

describe("isRetryableAiJobError", () => {
  it("retries provider and unknown infrastructure failures", () => {
    expect(isRetryableAiJobError(new AiProviderError())).toBe(true);
    expect(isRetryableAiJobError(new Error("ECONNRESET"))).toBe(true);
  });

  it("does not retry permanent AI or authorization failures", async () => {
    expect(isRetryableAiJobError(new AiMalformedResponseError())).toBe(false);
    expect(isRetryableAiJobError(new ConflictError())).toBe(false);
    expect(isRetryableAiJobError(new NotFoundError("Conversation"))).toBe(false);
    expect(isRetryableAiJobError(new TenantAccessError())).toBe(false);
    expect(isRetryableAiJobError(new ValidationError())).toBe(false);
    expect(isRetryableAiJobError(new AiToolError("AI_TOOL_LIMIT_EXCEEDED"))).toBe(
      false
    );
    expect(isRetryableAiJobError(new AiToolError("AI_TOOL_FAILED"))).toBe(false);
    expect(
      isRetryableAiJobError(new AiSalesAnalysisError("AI_MALFORMED_ANALYSIS"))
    ).toBe(false);
    expect(
      isRetryableAiJobError(new AiSalesRecommendationError("AI_RECOMMENDATION_FAILED"))
    ).toBe(false);
    expect(
      isRetryableAiJobError(
        new AiSalesRecommendationExecutionError("AI_RECOMMENDATION_EXECUTION_FAILED")
      )
    ).toBe(false);
  });
});

describe("aiJobErrorCode", () => {
  it("uses the application error code and never a stack trace", () => {
    expect(aiJobErrorCode(new AiProviderError())).toBe("AI_PROVIDER_ERROR");
    expect(aiJobErrorCode(new Error("secret stack"))).toBe("INTERNAL_ERROR");
  });
});

describe("retryDelaySeconds", () => {
  it("uses a bounded linear backoff", () => {
    expect(retryDelaySeconds(1)).toBe(5);
    expect(retryDelaySeconds(3)).toBe(15);
    expect(retryDelaySeconds(99)).toBe(30);
  });
});
