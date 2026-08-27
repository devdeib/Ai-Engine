/**
 * Server-derived sales/pipeline snapshot. The model never authors this object.
 * Boolean CRM flags use EXISTS queries so they are not limited to the 5-row
 * context pages.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ConversationStatus, LeadStatus } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";

export interface PipelineSnapshotInput {
  organizationId: string;
  leadId: string;
  conversationId: string;
  leadStatus: LeadStatus;
  conversationStatus: ConversationStatus;
  requiresHuman: boolean;
  aiPausedAt: string | null;
  contactEmailPresent: boolean;
  contactPhonePresent: boolean;
  messages: Array<{ direction: "inbound" | "outbound"; createdAt: string }>;
}

export async function buildPipelineSnapshot(
  input: PipelineSnapshotInput
): Promise<AiPipelineSnapshot> {
  const latest = input.messages[input.messages.length - 1];
  let lastInboundAt: string | null = null;
  let lastOutboundAt: string | null = null;
  for (const message of input.messages) {
    if (message.direction === "inbound") {
      lastInboundAt = message.createdAt;
    } else {
      lastOutboundAt = message.createdAt;
    }
  }

  const nowIso = new Date().toISOString();
  const [hasScheduledAppointment, hasPendingFollowUp, hasPendingAppointmentApproval] =
    await Promise.all([
      existsScheduledAppointment(input.organizationId, input.leadId),
      existsPendingFollowUp(input.organizationId, input.leadId),
      existsPendingAppointmentApproval(
        input.organizationId,
        input.leadId,
        input.conversationId,
        nowIso
      ),
    ]);

  return {
    leadStatus: input.leadStatus,
    conversationStatus: input.conversationStatus,
    requiresHuman: input.requiresHuman,
    aiPaused: input.aiPausedAt !== null,
    latestMessageDirection: latest?.direction ?? "inbound",
    lastInboundAt,
    lastOutboundAt,
    hasScheduledAppointment,
    hasPendingFollowUp,
    hasPendingAppointmentApproval,
    contactEmailPresent: input.contactEmailPresent,
    contactPhonePresent: input.contactPhonePresent,
  };
}

async function existsScheduledAppointment(
  organizationId: string,
  leadId: string
): Promise<boolean> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("status", "scheduled")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Failed to build pipeline snapshot");
  }
  return Boolean(data);
}

async function existsPendingFollowUp(
  organizationId: string,
  leadId: string
): Promise<boolean> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_follow_ups") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Failed to build pipeline snapshot");
  }
  return Boolean(data);
}

async function existsPendingAppointmentApproval(
  organizationId: string,
  leadId: string,
  conversationId: string,
  nowIso: string
): Promise<boolean> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("lead_id", leadId)
    .eq("conversation_id", conversationId)
    .eq("tool_name", "create_appointment")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error("Failed to build pipeline snapshot");
  }
  return Boolean(data);
}
