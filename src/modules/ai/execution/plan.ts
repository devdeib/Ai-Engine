/**
 * Phase 4.9 read-only execution plan. Computed from current server-owned
 * state. Never persists. Never authorizes or performs execution.
 */
import type {
  AiToolAction,
  AiToolActionStatus,
  AiToolActionToolName,
  AiToolActionTrust,
  ConversationStatus,
  AiSalesRecommendation,
} from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { recommend } from "@/modules/ai/recommendation/policy";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendationAction } from "@/modules/ai/recommendation/schema";
import { effectiveAiToolActionStatus } from "@/modules/ai/actions/map";
import { INBOUND_FOLLOW_UP_ACTION_STATUSES } from "@/modules/ai/execution/constants";
import {
  decisionsMatch,
  isExecutableFollowUp,
  type RecommendationExecutionSkipReason,
} from "@/modules/ai/execution/policy";

export const EXECUTION_PLAN_KINDS = [
  "executable_follow_up",
  "already_executed",
  "blocked_missing_schedule",
  "blocked_no_auto_escalation",
  "no_op",
  "blocked",
] as const;

export type ExecutionPlanKind = (typeof EXECUTION_PLAN_KINDS)[number];

export type ExecutionPlanObservability = "on_ledger" | "not_on_ledger";

export type ExecutionPlanSkipReason =
  | RecommendationExecutionSkipReason
  | "blocked_missing_schedule"
  | "blocked_no_auto_escalation";

export type PlanLedgerSource = Pick<
  AiToolAction,
  | "id"
  | "tool_name"
  | "status"
  | "trust"
  | "expires_at"
  | "created_at"
  | "inbound_message_id"
>;

export interface PublicPlanLedger {
  actionId: string;
  toolName: AiToolActionToolName;
  status: AiToolActionStatus;
  trust: AiToolActionTrust;
}

export interface PublicExecutionPlan {
  kind: ExecutionPlanKind;
  executable: boolean;
  observability: ExecutionPlanObservability;
  skipReason: ExecutionPlanSkipReason | null;
  ledger: PublicPlanLedger | null;
}

export interface PlanConversationState {
  organizationId: string;
  conversationId: string;
  leadId: string;
  status: ConversationStatus;
  requiresHuman: boolean;
  aiPausedAt: string | null;
}

export interface PlanLeadState {
  organizationId: string;
  leadId: string;
}

export interface PlanFromRecommendationInput {
  recommendation: AiSalesRecommendation;
  organizationId: string;
  conversationId: string;
  leadId: string;
  latestInboundId: string | null;
  conversation: PlanConversationState | null;
  lead: PlanLeadState | null;
  liveSnapshot: AiPipelineSnapshot | null;
  analysisPayload: AiSalesAnalysisPayload | null;
  inboundActions: PlanLedgerSource[];
  contextSkipReason?: RecommendationExecutionSkipReason | null;
  now?: Date;
}

const NO_OP_ACTIONS = new Set<AiSalesRecommendationAction>([
  "ask_qualification_question",
  "provide_information",
  "wait_for_customer",
  "defer_existing_control",
]);

const BLOCKING_FOLLOW_UP_STATUSES: ReadonlySet<string> = new Set(
  INBOUND_FOLLOW_UP_ACTION_STATUSES
);

function newestLedgerRow(rows: PlanLedgerSource[]): PlanLedgerSource | null {
  if (rows.length === 0) return null;
  const [newest] = [...rows].sort((left, right) => {
    const byCreated = right.created_at.localeCompare(left.created_at);
    if (byCreated !== 0) return byCreated;
    return right.id.localeCompare(left.id);
  });
  return newest ?? null;
}

export function preferredPlanLedgerTool(
  recommendedAction: AiSalesRecommendationAction
): AiToolActionToolName {
  return recommendedAction === "suggest_appointment_approval"
    ? "create_appointment"
    : "create_follow_up";
}

export function selectPlanLedgerRow(
  actions: PlanLedgerSource[],
  preferredTool: AiToolActionToolName
): PlanLedgerSource | null {
  const preferred = newestLedgerRow(
    actions.filter((action) => action.tool_name === preferredTool)
  );
  if (preferred) return preferred;
  const fallback: AiToolActionToolName =
    preferredTool === "create_follow_up"
      ? "create_appointment"
      : "create_follow_up";
  return newestLedgerRow(
    actions.filter((action) => action.tool_name === fallback)
  );
}

export function toPublicPlanLedger(
  action: PlanLedgerSource,
  now: Date = new Date()
): PublicPlanLedger {
  return {
    actionId: action.id,
    toolName: action.tool_name,
    status: effectiveAiToolActionStatus(action, now),
    trust: action.trust,
  };
}

function planResult(
  kind: ExecutionPlanKind,
  skipReason: ExecutionPlanSkipReason | null,
  ledger: PublicPlanLedger | null
): PublicExecutionPlan {
  return {
    kind,
    executable: kind === "executable_follow_up",
    observability: ledger ? "on_ledger" : "not_on_ledger",
    skipReason,
    ledger,
  };
}

function followUpRow(actions: PlanLedgerSource[]): PlanLedgerSource | null {
  return newestLedgerRow(
    actions.filter((action) => action.tool_name === "create_follow_up")
  );
}

function isCurrentRecommendation(
  recommendation: AiSalesRecommendation,
  latestInboundId: string | null
): boolean {
  return (
    latestInboundId !== null &&
    recommendation.inbound_message_id === latestInboundId
  );
}

function storedFollowUpBlocksExecution(action: PlanLedgerSource | null): boolean {
  if (!action) return false;
  return BLOCKING_FOLLOW_UP_STATUSES.has(action.status);
}

/**
 * Pure planner. Safe to call repeatedly. Performs no writes.
 */
export function planFromRecommendation(
  input: PlanFromRecommendationInput
): PublicExecutionPlan {
  const now = input.now ?? new Date();
  const rec = input.recommendation;
  const preferredTool = preferredPlanLedgerTool(rec.recommended_action);
  const selectedRow = selectPlanLedgerRow(input.inboundActions, preferredTool);
  const ledger = selectedRow ? toPublicPlanLedger(selectedRow, now) : null;
  const followUp = followUpRow(input.inboundActions);
  const blocked = (reason: ExecutionPlanSkipReason) =>
    planResult("blocked", reason, ledger);

  if (input.contextSkipReason) {
    return blocked(input.contextSkipReason);
  }

  if (
    rec.organization_id !== input.organizationId ||
    rec.conversation_id !== input.conversationId ||
    rec.lead_id !== input.leadId
  ) {
    return blocked("identity_mismatch");
  }

  if (rec.status !== "recorded") {
    return blocked("failed_recommendation");
  }

  if (rec.policy_version !== AI_SALES_RECOMMENDATION_POLICY_V1) {
    return blocked("unsupported_policy");
  }

  const conversation = input.conversation;
  if (!conversation) {
    return blocked("tenant_mismatch");
  }

  if (
    conversation.organizationId !== input.organizationId ||
    conversation.conversationId !== input.conversationId ||
    conversation.leadId !== input.leadId
  ) {
    return blocked("identity_mismatch");
  }

  if (conversation.status !== "open") {
    return blocked("closed");
  }
  if (conversation.aiPausedAt) {
    return blocked("conversation_paused");
  }
  if (conversation.requiresHuman) {
    return blocked("requires_human");
  }

  const lead = input.lead;
  if (!lead) {
    return blocked("tenant_mismatch");
  }
  if (
    lead.organizationId !== input.organizationId ||
    lead.leadId !== input.leadId
  ) {
    return blocked("identity_mismatch");
  }

  const liveSnapshot = input.liveSnapshot;
  if (!liveSnapshot) {
    return blocked("tenant_mismatch");
  }

  if (liveSnapshot.hasPendingFollowUp) {
    return blocked("already_has_pending_follow_up");
  }

  const fresh = recommend(liveSnapshot, input.analysisPayload);
  if (!decisionsMatch(rec, fresh)) {
    return blocked("policy_mismatch");
  }

  if (isExecutableFollowUp(rec, fresh)) {
    if (followUp?.status === "executed") {
      return planResult("already_executed", "already_has_tool_action", ledger);
    }
    if (storedFollowUpBlocksExecution(followUp)) {
      return blocked("already_has_tool_action");
    }
    if (!isCurrentRecommendation(rec, input.latestInboundId)) {
      return planResult("blocked", null, ledger);
    }
    return planResult("executable_follow_up", null, ledger);
  }

  if (rec.recommended_action === "suggest_appointment_approval") {
    return planResult(
      "blocked_missing_schedule",
      "blocked_missing_schedule",
      ledger
    );
  }
  if (rec.recommended_action === "suggest_human_handoff") {
    return planResult(
      "blocked_no_auto_escalation",
      "blocked_no_auto_escalation",
      ledger
    );
  }
  if (NO_OP_ACTIONS.has(rec.recommended_action)) {
    return planResult("no_op", null, ledger);
  }

  return blocked("not_executable");
}
