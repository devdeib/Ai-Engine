/**
 * Follow-up domain mutations — create and update (complete/cancel/edit pending).
 *
 * Lifecycle: pending → completed | cancelled. No reopen.
 * Edits to title/notes/due_at/assigned_user_id are only allowed while pending.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  isMemberOfOrg,
  requireOrgMembership,
} from "@/modules/organizations/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createFollowUpSchema,
  updateFollowUpSchema,
} from "@/modules/follow-ups/schema";
import {
  assertFollowUpInOrg,
  assertLeadInOrg,
} from "@/modules/follow-ups/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { followUpActivityContent } from "@/modules/leads/activities/activity-content";
import type { LeadFollowUp } from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

async function assertAssigneeInOrg(
  organizationId: string,
  assignedUserId: string | null | undefined
): Promise<void> {
  if (!assignedUserId) return;
  const valid = await isMemberOfOrg(organizationId, assignedUserId);
  if (!valid) {
    throw new ValidationError("Invalid follow-up data", {
      assigned_user_id: ["Assignee must be a member of this organization"],
    });
  }
}

export async function createLeadFollowUp(
  organizationId: string,
  userId: string | null,
  leadId: string,
  input: unknown,
  options?: { idempotencyKey?: string }
): Promise<LeadFollowUp> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const parsed = createFollowUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid follow-up data",
      parsed.error.flatten().fieldErrors
    );
  }

  await assertAssigneeInOrg(organizationId, parsed.data.assigned_user_id);

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    lead_id: leadId,
    title: parsed.data.title,
    notes: parsed.data.notes ?? null,
    due_at: parsed.data.due_at,
    assigned_user_id: parsed.data.assigned_user_id ?? null,
  };
  if (options?.idempotencyKey) {
    insertPayload.idempotency_key = options.idempotencyKey;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_follow_ups") as any)
    .insert(insertPayload)
    .select()
    .single();

  if (isUniqueViolation(error) && options?.idempotencyKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (supabase.from("lead_follow_ups") as any)
      .select()
      .eq("organization_id", organizationId)
      .eq("idempotency_key", options.idempotencyKey)
      .single();
    if (existing.data) {
      return existing.data as LeadFollowUp;
    }
  }

  if (error || !data) {
    throw new Error(`Failed to create follow-up: ${error?.message}`);
  }

  const followUp = data as LeadFollowUp;
  await recordLeadActivity({
    organizationId,
    userId,
    leadId: followUp.lead_id,
    type: "follow_up",
    content: followUpActivityContent("created", followUp.title),
  });

  return followUp;
}

export async function updateLeadFollowUp(
  organizationId: string,
  userId: string,
  followUpId: string,
  input: unknown
): Promise<LeadFollowUp> {
  await requireOrgMembership(organizationId, userId);

  const parsed = updateFollowUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid follow-up data",
      parsed.error.flatten().fieldErrors
    );
  }

  await assertAssigneeInOrg(organizationId, parsed.data.assigned_user_id);

  const supabase = await createClient();
  const current = await assertFollowUpInOrg(supabase, followUpId, organizationId);

  if (current.status !== "pending") {
    throw new ValidationError("Invalid follow-up data", {
      status: ["Only pending follow-ups can be updated"],
    });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.due_at !== undefined) patch.due_at = parsed.data.due_at;
  if (parsed.data.assigned_user_id !== undefined) {
    patch.assigned_user_id = parsed.data.assigned_user_id;
  }
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("lead_follow_ups") as any)
    .update(patch)
    .eq("id", followUpId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("Follow-up");
  }

  const followUp = data as LeadFollowUp;
  if (current.status !== followUp.status) {
    if (followUp.status === "completed") {
      await recordLeadActivity({
        organizationId,
        userId,
        leadId: followUp.lead_id,
        type: "follow_up",
        content: followUpActivityContent("completed", followUp.title),
      });
    } else if (followUp.status === "cancelled") {
      await recordLeadActivity({
        organizationId,
        userId,
        leadId: followUp.lead_id,
        type: "follow_up",
        content: followUpActivityContent("cancelled", followUp.title),
      });
    }
  }

  return followUp;
}
