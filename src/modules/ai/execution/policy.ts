/**
 * Pure Phase 4.8 execution-policy predicates.
 * Shared with the Phase 4.9 read-only planner. No I/O. No CRM writes.
 */
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiSalesRecommendationDecision } from "@/modules/ai/recommendation/schema";
import { AI_SALES_RECOMMENDATION_EXECUTION_TOOL } from "@/modules/ai/execution/constants";

export type RecommendationExecutionSkipReason =
  | "recommendation_unavailable"
  | "failed_recommendation"
  | "unsupported_policy"
  | "tenant_mismatch"
  | "identity_mismatch"
  | "closed"
  | "conversation_paused"
  | "requires_human"
  | "policy_mismatch"
  | "not_executable"
  | "already_has_pending_follow_up"
  | "already_has_tool_action";

export function decisionsMatch(
  persisted: AiSalesRecommendation,
  fresh: AiSalesRecommendationDecision
): boolean {
  return (
    persisted.recommended_action === fresh.recommendedAction &&
    persisted.mapped_tool_name === fresh.mappedToolName &&
    persisted.requires_human_approval === fresh.requiresHumanApproval
  );
}

export function isExecutableFollowUp(
  persisted: AiSalesRecommendation,
  fresh: AiSalesRecommendationDecision
): boolean {
  return (
    persisted.recommended_action === "suggest_follow_up" &&
    persisted.mapped_tool_name === AI_SALES_RECOMMENDATION_EXECUTION_TOOL &&
    persisted.requires_human_approval === false &&
    fresh.recommendedAction === "suggest_follow_up" &&
    fresh.mappedToolName === AI_SALES_RECOMMENDATION_EXECUTION_TOOL &&
    fresh.requiresHumanApproval === false
  );
}
