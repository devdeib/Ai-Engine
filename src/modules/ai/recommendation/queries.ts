/**
 * Read-only AI sales recommendation queries. Identity comes from trusted arguments.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import { getConversation } from "@/modules/conversations/queries";
import type { AiSalesRecommendation } from "@/lib/db/types";
import { getLatestInboundMessageId } from "@/modules/ai/analysis/queries";

export interface AiSalesRecommendationsPagination {
  page: number;
  limit: number;
}

export async function listAiSalesRecommendations(
  organizationId: string,
  userId: string,
  conversationId: string,
  pagination: AiSalesRecommendationsPagination = { page: 1, limit: 20 }
): Promise<AiSalesRecommendation[]> {
  await requireOrgMembership(organizationId, userId);
  await getConversation(organizationId, userId, conversationId);

  const { page, limit } = pagination;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Failed to list AI sales recommendations");
  }
  return (data ?? []) as AiSalesRecommendation[];
}

export async function getCurrentAiSalesRecommendation(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<AiSalesRecommendation> {
  await requireOrgMembership(organizationId, userId);
  await getConversation(organizationId, userId, conversationId);

  const latestInboundId = await getLatestInboundMessageId(
    organizationId,
    conversationId
  );
  if (!latestInboundId) {
    throw new NotFoundError("Recommendation");
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("inbound_message_id", latestInboundId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Recommendation");
  }
  return data as AiSalesRecommendation;
}
