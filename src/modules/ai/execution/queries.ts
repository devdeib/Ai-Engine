/**
 * Read helpers for the Phase 4.8 execution gate.
 * Identity comes from trusted arguments, never from model output.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AiSalesRecommendation } from "@/lib/db/types";
import { INBOUND_FOLLOW_UP_ACTION_STATUSES } from "@/modules/ai/execution/constants";
import type { PlanLedgerSource } from "@/modules/ai/execution/plan";

export async function loadRecommendationByInbound(
  organizationId: string,
  inboundMessageId: string
): Promise<AiSalesRecommendation | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_sales_recommendations") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("inbound_message_id", inboundMessageId)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiSalesRecommendation;
}

export async function hasInboundFollowUpAction(
  organizationId: string,
  inboundMessageId: string
): Promise<boolean> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("inbound_message_id", inboundMessageId)
    .eq("tool_name", "create_follow_up")
    .in("status", [...INBOUND_FOLLOW_UP_ACTION_STATUSES])
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Failed to inspect AI tool actions");
  }
  return Boolean(data);
}

const PLAN_LEDGER_SELECT =
  "id, tool_name, status, trust, expires_at, created_at, inbound_message_id";

export async function listConversationToolActions(
  organizationId: string,
  conversationId: string
): Promise<PlanLedgerSource[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select(PLAN_LEDGER_SELECT)
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Failed to inspect AI tool actions");
  }
  return (data ?? []) as PlanLedgerSource[];
}
