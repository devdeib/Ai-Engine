/**
 * Read-only AI sales analysis queries. Identity comes from trusted arguments.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import { getConversation } from "@/modules/conversations/queries";
import type { AiSalesAnalysis } from "@/lib/db/types";

export interface AiSalesAnalysesPagination {
  page: number;
  limit: number;
}

export async function listAiSalesAnalyses(
  organizationId: string,
  userId: string,
  conversationId: string,
  pagination: AiSalesAnalysesPagination = { page: 1, limit: 20 }
): Promise<AiSalesAnalysis[]> {
  await requireOrgMembership(organizationId, userId);
  await getConversation(organizationId, userId, conversationId);

  const { page, limit } = pagination;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_analyses") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Failed to list AI sales analyses");
  }
  return (data ?? []) as AiSalesAnalysis[];
}

export async function getLatestAiSalesAnalysis(
  organizationId: string,
  userId: string,
  conversationId: string
): Promise<AiSalesAnalysis> {
  const rows = await listAiSalesAnalyses(
    organizationId,
    userId,
    conversationId,
    { page: 1, limit: 1 }
  );
  const row = rows[0];
  if (!row) {
    throw new NotFoundError("Analysis");
  }
  return row;
}

export async function getLatestInboundMessageId(
  organizationId: string,
  conversationId: string
): Promise<string | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("messages") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}
