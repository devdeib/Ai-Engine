/**
 * Appointment domain mutations — create and update (complete/cancel/edit scheduled).
 *
 * Lifecycle: scheduled → completed | cancelled. No reopen.
 * Field edits are only allowed while scheduled.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  isMemberOfOrg,
  requireOrgMembership,
} from "@/modules/organizations/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@/modules/appointments/schema";
import {
  assertAppointmentInOrg,
  assertLeadInOrg,
} from "@/modules/appointments/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { appointmentActivityContent } from "@/modules/leads/activities/activity-content";
import type { Appointment } from "@/lib/db/types";

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
    throw new ValidationError("Invalid appointment data", {
      assigned_user_id: ["Assignee must be a member of this organization"],
    });
  }
}

function assertRange(
  startsAt: string,
  endsAt: string | null | undefined
): void {
  if (!endsAt) return;
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new ValidationError("Invalid appointment data", {
      ends_at: ["ends_at must be after starts_at"],
    });
  }
}

export async function createAppointment(
  organizationId: string,
  userId: string,
  leadId: string,
  input: unknown,
  options?: { idempotencyKey?: string }
): Promise<Appointment> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid appointment data",
      parsed.error.flatten().fieldErrors
    );
  }

  await assertAssigneeInOrg(organizationId, parsed.data.assigned_user_id);

  const supabase = await createClient();
  await assertLeadInOrg(supabase, leadId, organizationId);

  const insertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    lead_id: leadId,
    starts_at: parsed.data.starts_at,
    ends_at: parsed.data.ends_at ?? null,
    location: parsed.data.location ?? null,
    notes: parsed.data.notes ?? null,
    assigned_user_id: parsed.data.assigned_user_id ?? null,
  };
  if (options?.idempotencyKey) {
    insertPayload.idempotency_key = options.idempotencyKey;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .insert(insertPayload)
    .select()
    .single();

  if (isUniqueViolation(error) && options?.idempotencyKey) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (supabase.from("appointments") as any)
      .select()
      .eq("organization_id", organizationId)
      .eq("idempotency_key", options.idempotencyKey)
      .single();
    if (existing.data) {
      return existing.data as Appointment;
    }
  }

  if (error || !data) {
    throw new Error(`Failed to create appointment: ${error?.message}`);
  }

  const appointment = data as Appointment;
  await recordLeadActivity({
    organizationId,
    userId,
    leadId: appointment.lead_id,
    type: "appointment",
    content: appointmentActivityContent("scheduled"),
  });

  return appointment;
}

export async function updateAppointment(
  organizationId: string,
  userId: string,
  appointmentId: string,
  input: unknown
): Promise<Appointment> {
  await requireOrgMembership(organizationId, userId);

  const parsed = updateAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid appointment data",
      parsed.error.flatten().fieldErrors
    );
  }

  await assertAssigneeInOrg(organizationId, parsed.data.assigned_user_id);

  const supabase = await createClient();
  const current = await assertAppointmentInOrg(
    supabase,
    appointmentId,
    organizationId
  );

  if (current.status !== "scheduled") {
    throw new ValidationError("Invalid appointment data", {
      status: ["Only scheduled appointments can be updated"],
    });
  }

  const nextStarts = parsed.data.starts_at ?? current.starts_at;
  const nextEnds =
    parsed.data.ends_at !== undefined ? parsed.data.ends_at : current.ends_at;
  assertRange(nextStarts, nextEnds);

  const patch: Record<string, unknown> = {};
  if (parsed.data.starts_at !== undefined) patch.starts_at = parsed.data.starts_at;
  if (parsed.data.ends_at !== undefined) patch.ends_at = parsed.data.ends_at;
  if (parsed.data.location !== undefined) patch.location = parsed.data.location;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
  if (parsed.data.assigned_user_id !== undefined) {
    patch.assigned_user_id = parsed.data.assigned_user_id;
  }
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("appointments") as any)
    .update(patch)
    .eq("id", appointmentId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("Appointment");
  }

  const appointment = data as Appointment;
  if (current.status !== appointment.status) {
    if (appointment.status === "completed") {
      await recordLeadActivity({
        organizationId,
        userId,
        leadId: appointment.lead_id,
        type: "appointment",
        content: appointmentActivityContent("completed"),
      });
    } else if (appointment.status === "cancelled") {
      await recordLeadActivity({
        organizationId,
        userId,
        leadId: appointment.lead_id,
        type: "appointment",
        content: appointmentActivityContent("cancelled"),
      });
    }
  }

  return appointment;
}
