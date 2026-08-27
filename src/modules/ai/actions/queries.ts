/**
 * Read-only AI tool action queries. Identity comes from trusted arguments.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import type {
  AiToolAction,
  AiToolActionStatus,
  AiToolActionWithLead,
} from "@/lib/db/types";
import {
  effectiveAiToolActionStatus,
  toAiToolActionWithLead,
} from "@/modules/ai/actions/map";

const ACTION_WITH_LEAD_SELECT = `
  *,
  lead:leads (
    id,
    first_name,
    last_name,
    company_name
  )
`;

export interface AiToolActionsPagination {
  page: number;
  limit: number;
}

export interface AiToolActionsFilter {
  status?: AiToolActionStatus;
  conversationId?: string;
  leadId?: string;
}

export async function listAiToolActions(
  organizationId: string,
  userId: string,
  pagination: AiToolActionsPagination = { page: 1, limit: 20 },
  filter: AiToolActionsFilter = {}
): Promise<AiToolActionWithLead[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const nowIso = new Date().toISOString();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("ai_tool_actions") as any)
    .select(ACTION_WITH_LEAD_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.conversationId) {
    query = query.eq("conversation_id", filter.conversationId);
  }
  if (filter.leadId) {
    query = query.eq("lead_id", filter.leadId);
  }
  if (filter.status === "pending") {
    query = query.eq("status", "pending").gt("expires_at", nowIso);
  } else if (filter.status === "expired") {
    query = query.eq("status", "pending").lte("expires_at", nowIso);
  } else if (filter.status) {
    query = query.eq("status", filter.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Failed to list AI tool actions");
  }

  const now = new Date();
  return ((data ?? []) as unknown[]).map((row) => {
    const mapped = toAiToolActionWithLead(row);
    return {
      ...mapped,
      status: effectiveAiToolActionStatus(mapped, now),
    };
  });
}

export async function getAiToolAction(
  organizationId: string,
  userId: string,
  actionId: string
): Promise<AiToolActionWithLead> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select(ACTION_WITH_LEAD_SELECT)
    .eq("id", actionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("AI tool action");
  }

  const mapped = toAiToolActionWithLead(data);
  return {
    ...mapped,
    status: effectiveAiToolActionStatus(mapped),
  };
}

export async function loadAiToolActionRow(
  organizationId: string,
  actionId: string
): Promise<AiToolAction | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select("*")
    .eq("id", actionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as AiToolAction;
}

export async function loadAiToolActionByInboundHash(
  organizationId: string,
  inboundMessageId: string,
  toolName: AiToolAction["tool_name"],
  inputHash: string
): Promise<AiToolAction | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("inbound_message_id", inboundMessageId)
    .eq("tool_name", toolName)
    .eq("input_hash", inputHash)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data as AiToolAction;
}
