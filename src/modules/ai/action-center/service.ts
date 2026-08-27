/**
 * Organization-level read-only AI operator action center.
 * Discovers existing pending HITL and current 4.9 plans. Never executes.
 */
import "server-only";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { listAiToolActions } from "@/modules/ai/actions/queries";
import { toPublicAiToolAction } from "@/modules/ai/actions/map";
import { getLatestInboundMessageId } from "@/modules/ai/analysis/queries";
import {
  loadRecommendationPlanContext,
  planForRecommendation,
} from "@/modules/ai/execution/plan-context";
import { ACTION_CENTER_DEFAULT_LIMIT } from "@/modules/ai/action-center/constants";
import { listRecentActionableRecommendations } from "@/modules/ai/action-center/queries";
import {
  actionCenterItemKind,
  isActionCenterActionableAction,
  toPublicActionCenterRecommendationItem,
} from "@/modules/ai/action-center/map";
import type {
  ActionCenterRecommendationItem,
  AiActionCenter,
  AiActionCenterPagination,
} from "@/modules/ai/action-center/types";

async function latestInboundByConversation(
  organizationId: string,
  conversationIds: string[]
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(conversationIds)];
  const entries = await Promise.all(
    uniqueIds.map(async (conversationId) => {
      const latestInboundId = await getLatestInboundMessageId(
        organizationId,
        conversationId
      );
      return [conversationId, latestInboundId] as const;
    })
  );
  return new Map(entries);
}

function isCurrentRecommendation(
  inboundMessageId: string,
  latestInboundId: string | null | undefined
): boolean {
  return latestInboundId != null && inboundMessageId === latestInboundId;
}

export async function getAiActionCenter(
  organizationId: string,
  userId: string,
  pagination: AiActionCenterPagination = {
    page: 1,
    limit: ACTION_CENTER_DEFAULT_LIMIT,
  }
): Promise<AiActionCenter> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;

  const pendingRows = await listAiToolActions(
    organizationId,
    userId,
    { page, limit },
    { status: "pending" }
  );
  const pendingActions = pendingRows
    .map((action) => toPublicAiToolAction(action))
    .filter((action) => action.status === "pending");

  const candidates = await listRecentActionableRecommendations(
    organizationId,
    userId,
    limit
  );

  const latestByConversation = await latestInboundByConversation(
    organizationId,
    candidates.map((row) => row.conversation_id)
  );

  const currentByConversation = new Map<string, (typeof candidates)[number]>();
  for (const row of candidates) {
    if (row.organization_id !== organizationId) continue;
    if (currentByConversation.has(row.conversation_id)) continue;
    if (!isActionCenterActionableAction(row.recommended_action)) continue;
    if (
      !isCurrentRecommendation(
        row.inbound_message_id,
        latestByConversation.get(row.conversation_id)
      )
    ) {
      continue;
    }
    currentByConversation.set(row.conversation_id, row);
  }

  const currentRows = [...currentByConversation.values()].slice(0, limit);

  const planned = await Promise.all(
    currentRows.map(async (row) => {
      const context = await loadRecommendationPlanContext(
        organizationId,
        userId,
        row.conversation_id
      );
      if (
        !isCurrentRecommendation(row.inbound_message_id, context.latestInboundId)
      ) {
        return null;
      }
      if (!isActionCenterActionableAction(row.recommended_action)) {
        return null;
      }
      const plan = planForRecommendation(row, context);
      const kind = actionCenterItemKind(row.recommended_action, plan.kind);
      if (!kind) return null;
      return toPublicActionCenterRecommendationItem(row, plan, kind);
    })
  );

  const recommendationItems = planned.filter(
    (item): item is ActionCenterRecommendationItem => item !== null
  );

  const pendingAppointments = pendingActions.filter(
    (action) => action.toolName === "create_appointment"
  ).length;
  const appointmentRecommendations = recommendationItems.filter(
    (item) => item.kind === "appointment_needs_scheduling"
  ).length;
  const handoffRecommendations = recommendationItems.filter(
    (item) => item.kind === "human_handoff_recommended"
  ).length;

  return {
    pendingActions,
    recommendationItems,
    counts: {
      pendingAppointments,
      appointmentRecommendations,
      handoffRecommendations,
      total:
        pendingAppointments +
        appointmentRecommendations +
        handoffRecommendations,
    },
  };
}
