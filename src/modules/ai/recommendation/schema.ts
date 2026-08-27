/**
 * Server-owned sales recommendation schema. Distinct from AiDecision
 * (eligibility skip vs respond) and from Phase 4.6 analysis payload.
 */
import { z } from "zod";
import { AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS } from "@/modules/ai/analysis/schema";
import { pipelineSnapshotSchema } from "@/modules/ai/analysis/schema";
import {
  AI_SALES_RECOMMENDATION_ACTIONS,
  AI_SALES_RECOMMENDATION_MAPPED_TOOLS,
  AI_SALES_RECOMMENDATION_REASON_CODES,
} from "@/modules/ai/recommendation/constants";

export type AiSalesRecommendationAction =
  (typeof AI_SALES_RECOMMENDATION_ACTIONS)[number];

export type AiSalesRecommendationReasonCode =
  (typeof AI_SALES_RECOMMENDATION_REASON_CODES)[number];

export type AiSalesRecommendationMappedTool =
  (typeof AI_SALES_RECOMMENDATION_MAPPED_TOOLS)[number];

export type AiSalesAnalysisNextBestAction =
  (typeof AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS)[number];

export const aiSalesRecommendationActionSchema = z.enum(
  AI_SALES_RECOMMENDATION_ACTIONS
);

export const aiSalesRecommendationReasonCodeSchema = z.enum(
  AI_SALES_RECOMMENDATION_REASON_CODES
);

export const aiSalesRecommendationMappedToolSchema = z.enum(
  AI_SALES_RECOMMENDATION_MAPPED_TOOLS
);

export const citedAnalysisActionSchema = z.enum(
  AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS
);

export const recommendationReasonCodesSchema = z
  .array(aiSalesRecommendationReasonCodeSchema)
  .max(8)
  .refine((items) => new Set(items).size === items.length, {
    message: "Reason codes must be unique",
  });

export interface AiSalesRecommendationDecision {
  recommendedAction: AiSalesRecommendationAction;
  reasonCodes: AiSalesRecommendationReasonCode[];
  requiresHumanApproval: boolean;
  mappedToolName: AiSalesRecommendationMappedTool | null;
}

export const listAiSalesRecommendationsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(20),
});

export { pipelineSnapshotSchema };
