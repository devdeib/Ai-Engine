/**
 * Read-only action-center recommendation queries. Identity comes from trusted arguments.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  ACTION_CENTER_ACTIONABLE_ACTIONS,
  ACTION_CENTER_DEFAULT_LIMIT,
  actionCenterCandidateLimit,
} from "@/modules/ai/action-center/constants";
import { toAiSalesRecommendationWithLead } from "@/modules/ai/action-center/map";
import type { AiSalesRecommendationWithLead } from "@/modules/ai/action-center/types";

const RECOMMENDATION_WITH_LEAD_SELECT = `
  *,
  lead:leads (
    id,
    first_name,
    last_name,
    company_name
  )
`;

export async function listRecentActionableRecommendations(
  organizationId: string,
  userId: string,
  limit: number = ACTION_CENTER_DEFAULT_LIMIT
): Promise<AiSalesRecommendationWithLead[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .select(RECOMMENDATION_WITH_LEAD_SELECT)
    .eq("organization_id", organizationId)
    .eq("status", "recorded")
    .in("recommended_action", [...ACTION_CENTER_ACTIONABLE_ACTIONS])
    .order("created_at", { ascending: false })
    .limit(actionCenterCandidateLimit(limit));

  if (error) {
    throw new Error("Failed to list actionable AI recommendations");
  }

  return ((data ?? []) as unknown[]).map((row) =>
    toAiSalesRecommendationWithLead(row)
  );
}
