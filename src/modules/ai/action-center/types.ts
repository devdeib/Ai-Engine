import type {
  AiSalesRecommendation,
  ConversationLeadSummary,
} from "@/lib/db/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";
import type {
  ExecutionPlanKind,
  ExecutionPlanObservability,
  ExecutionPlanSkipReason,
  PublicPlanLedger,
} from "@/modules/ai/execution/plan";
import type { ActionCenterActionableAction } from "@/modules/ai/action-center/constants";

export type ActionCenterRecommendationKind =
  | "appointment_needs_scheduling"
  | "human_handoff_recommended";

export type ActionCenterPlanKind = Extract<
  ExecutionPlanKind,
  "blocked_missing_schedule" | "blocked_no_auto_escalation"
>;

export interface AiSalesRecommendationWithLead extends AiSalesRecommendation {
  lead: ConversationLeadSummary | null;
}

export interface ActionCenterLeadSummary {
  firstName: string;
  lastName: string;
  companyName: string | null;
}

export interface ActionCenterRecommendationItem {
  id: string;
  kind: ActionCenterRecommendationKind;
  conversationId: string;
  recommendedAction: ActionCenterActionableAction;
  planKind: ActionCenterPlanKind;
  executable: boolean;
  observability: ExecutionPlanObservability;
  skipReason: ExecutionPlanSkipReason | null;
  ledger: PublicPlanLedger | null;
  createdAt: string;
  lead: ActionCenterLeadSummary | null;
  href: string;
}

export interface AiActionCenterCounts {
  pendingAppointments: number;
  appointmentRecommendations: number;
  handoffRecommendations: number;
  total: number;
}

export interface AiActionCenter {
  pendingActions: AiToolActionPublic[];
  recommendationItems: ActionCenterRecommendationItem[];
  counts: AiActionCenterCounts;
}

export interface AiActionCenterPagination {
  page: number;
  limit: number;
}
