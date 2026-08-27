import type {
  AiSalesRecommendation,
  ConversationLeadSummary,
} from "@/lib/db/types";
import type { PublicExecutionPlan } from "@/modules/ai/execution/plan";
import {
  ACTION_CENTER_ACTIONABLE_ACTIONS,
  actionCenterConversationHref,
  type ActionCenterActionableAction,
} from "@/modules/ai/action-center/constants";
import type {
  ActionCenterPlanKind,
  ActionCenterRecommendationItem,
  ActionCenterRecommendationKind,
  AiSalesRecommendationWithLead,
} from "@/modules/ai/action-center/types";

export function isActionCenterActionableAction(
  action: string
): action is ActionCenterActionableAction {
  return (ACTION_CENTER_ACTIONABLE_ACTIONS as readonly string[]).includes(
    action
  );
}

export function actionCenterItemKind(
  recommendedAction: ActionCenterActionableAction,
  planKind: PublicExecutionPlan["kind"]
): ActionCenterRecommendationKind | null {
  if (
    recommendedAction === "suggest_appointment_approval" &&
    planKind === "blocked_missing_schedule"
  ) {
    return "appointment_needs_scheduling";
  }
  if (
    recommendedAction === "suggest_human_handoff" &&
    planKind === "blocked_no_auto_escalation"
  ) {
    return "human_handoff_recommended";
  }
  return null;
}

function leadSummary(
  lead: ConversationLeadSummary | null
): ActionCenterRecommendationItem["lead"] {
  if (!lead) return null;
  return {
    firstName: lead.first_name,
    lastName: lead.last_name,
    companyName: lead.company_name,
  };
}

export function toAiSalesRecommendationWithLead(
  row: unknown
): AiSalesRecommendationWithLead {
  const raw = row as AiSalesRecommendation & { lead?: unknown };
  const embedded = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  let lead: ConversationLeadSummary | null = null;
  if (
    embedded &&
    typeof embedded === "object" &&
    "id" in embedded &&
    "first_name" in embedded &&
    "last_name" in embedded
  ) {
    const candidate = embedded as ConversationLeadSummary;
    lead = {
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      company_name: candidate.company_name ?? null,
    };
  }
  return { ...(raw as AiSalesRecommendation), lead };
}

export function toPublicActionCenterRecommendationItem(
  row: AiSalesRecommendationWithLead,
  plan: PublicExecutionPlan,
  kind: ActionCenterRecommendationKind
): ActionCenterRecommendationItem {
  const recommendedAction = row.recommended_action;
  if (!isActionCenterActionableAction(recommendedAction)) {
    throw new Error("Recommendation is not an action-center actionable kind");
  }

  return {
    id: row.id,
    kind,
    conversationId: row.conversation_id,
    recommendedAction,
    planKind: plan.kind as ActionCenterPlanKind,
    executable: plan.executable,
    observability: plan.observability,
    skipReason: plan.skipReason,
    ledger: plan.ledger,
    createdAt: row.created_at,
    lead: leadSummary(row.lead),
    href: actionCenterConversationHref(row.conversation_id),
  };
}
