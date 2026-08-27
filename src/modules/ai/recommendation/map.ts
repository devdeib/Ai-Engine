import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesRecommendation } from "@/lib/db/types";
import { pipelineSnapshotSchema } from "@/modules/ai/analysis/schema";
import {
  aiSalesRecommendationActionSchema,
  aiSalesRecommendationMappedToolSchema,
  citedAnalysisActionSchema,
  recommendationReasonCodesSchema,
  type AiSalesAnalysisNextBestAction,
  type AiSalesRecommendationAction,
  type AiSalesRecommendationMappedTool,
} from "@/modules/ai/recommendation/schema";
import type { PublicExecutionPlan } from "@/modules/ai/execution/plan";

export interface PublicAiSalesRecommendation {
  id: string;
  status: "recorded" | "failed";
  policyVersion: string;
  createdAt: string;
  inboundMessageCreatedAt: string;
  isCurrent: boolean;
  recommendedAction: AiSalesRecommendationAction;
  citedAnalysisAction: AiSalesAnalysisNextBestAction | null;
  requiresHumanApproval: boolean;
  mappedToolName: AiSalesRecommendationMappedTool | null;
  reasonCodes: string[];
  pipeline: AiPipelineSnapshot;
  plan: PublicExecutionPlan;
}

export function toPublicAiSalesRecommendation(
  row: AiSalesRecommendation,
  latestInboundId: string | null,
  plan: PublicExecutionPlan
): PublicAiSalesRecommendation {
  const pipeline = pipelineSnapshotSchema.parse(row.pipeline_snapshot);
  const recommendedAction = aiSalesRecommendationActionSchema.parse(
    row.recommended_action
  );
  const cited = row.cited_analysis_action
    ? citedAnalysisActionSchema.parse(row.cited_analysis_action)
    : null;
  const mapped = row.mapped_tool_name
    ? aiSalesRecommendationMappedToolSchema.parse(row.mapped_tool_name)
    : null;
  const reasonCodes = recommendationReasonCodesSchema.parse(row.reason_codes);

  return {
    id: row.id,
    status: row.status,
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    inboundMessageCreatedAt: row.inbound_message_created_at,
    isCurrent:
      latestInboundId !== null && row.inbound_message_id === latestInboundId,
    recommendedAction,
    citedAnalysisAction: cited,
    requiresHumanApproval: row.requires_human_approval,
    mappedToolName: mapped,
    reasonCodes: [...reasonCodes],
    pipeline,
    plan,
  };
}
