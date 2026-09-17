/**
 * Durable AI write-tool execution and human approval.
 * The model never supplies identity, approval state, or resource IDs.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { createLeadFollowUp } from "@/modules/follow-ups/actions";
import { createAppointment } from "@/modules/appointments/actions";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  aiAppointmentApprovalRequestedContent,
  aiAppointmentRequestRejectedContent,
} from "@/modules/leads/activities/activity-content";
import type { AiToolContext } from "@/modules/ai/tools/types";
import type {
  CreateAppointmentToolInput,
  CreateFollowUpToolInput,
  RecordCustomerFactsToolInput,
} from "@/modules/ai/tools/write-schemas";
import {
  createAppointmentToolInputSchema,
} from "@/modules/ai/tools/write-schemas";
import { applyRecordedCustomerFacts } from "@/modules/leads/qualification-write";
import { hashAiToolInput } from "@/modules/ai/actions/hash";
import {
  effectiveAiToolActionStatus,
  isAiToolActionExpired,
} from "@/modules/ai/actions/map";
import { loadAiToolActionRow } from "@/modules/ai/actions/queries";
import { AI_TOOL_ACTION_TTL_MS } from "@/modules/ai/types";
import type { AiToolAction } from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

function followUpPayload(input: CreateFollowUpToolInput): Record<string, unknown> {
  return {
    title: input.title,
    notes: input.notes ?? null,
    dueAt: input.dueAt,
  };
}

function appointmentPayload(
  input: CreateAppointmentToolInput
): Record<string, unknown> {
  return {
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };
}

function followUpSummary(input: CreateFollowUpToolInput): Record<string, unknown> {
  return {
    status: "created",
    title: input.title,
    dueAt: input.dueAt,
  };
}

function appointmentPendingSummary(
  input: CreateAppointmentToolInput
): Record<string, unknown> {
  return {
    status: "pending_approval",
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    location: input.location ?? null,
  };
}

async function loadByHash(input: {
  organizationId: string;
  inboundMessageId: string;
  toolName: string;
  inputHash: string;
}): Promise<AiToolAction | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("inbound_message_id", input.inboundMessageId)
    .eq("tool_name", input.toolName)
    .eq("input_hash", input.inputHash)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiToolAction;
}

async function insertAction(
  row: Record<string, unknown>
): Promise<{ action: AiToolAction | null; unique: boolean }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .insert(row)
    .select()
    .single();
  if (isUniqueViolation(error)) {
    return { action: null, unique: true };
  }
  if (error || !data) {
    throw new Error("Failed to record AI tool action");
  }
  return { action: data as AiToolAction, unique: false };
}

async function updateAction(
  organizationId: string,
  actionId: string,
  patch: Record<string, unknown>
): Promise<AiToolAction | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .update(patch)
    .eq("id", actionId)
    .eq("organization_id", organizationId)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error("Failed to update AI tool action");
  }
  return (data as AiToolAction | null) ?? null;
}

async function markFailed(
  organizationId: string,
  actionId: string,
  errorCode: string
): Promise<void> {
  await updateAction(organizationId, actionId, {
    status: "failed",
    error_code: errorCode,
  });
}

async function completeFollowUp(
  ctx: AiToolContext,
  action: AiToolAction,
  input: CreateFollowUpToolInput
): Promise<Record<string, unknown>> {
  try {
    const followUp = await createLeadFollowUp(
      ctx.organizationId,
      ctx.userId,
      ctx.leadId,
      {
        title: input.title,
        notes: input.notes ?? null,
        due_at: input.dueAt,
      },
      { idempotencyKey: action.id }
    );
    const summary = followUpSummary(input);
    await updateAction(ctx.organizationId, action.id, {
      status: "executed",
      executed_at: new Date().toISOString(),
      result_resource_type: "lead_follow_up",
      result_resource_id: followUp.id,
      result_summary: summary,
      error_code: null,
    });
    logger.info("AI tool executed", {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      tool: "create_follow_up",
      outcome: "ok",
      actionId: action.id,
    });
    return summary;
  } catch (error) {
    if (error instanceof ValidationError) {
      await markFailed(ctx.organizationId, action.id, "VALIDATION_ERROR");
      throw error;
    }
    if (error instanceof NotFoundError) {
      await markFailed(ctx.organizationId, action.id, "NOT_FOUND");
      throw error;
    }
    await markFailed(ctx.organizationId, action.id, "AI_TOOL_FAILED");
    throw error;
  }
}

export async function executeCreateFollowUp(
  ctx: AiToolContext,
  input: CreateFollowUpToolInput
): Promise<Record<string, unknown>> {
  const payload = followUpPayload(input);
  const inputHash = hashAiToolInput(payload);

  const inserted = await insertAction({
    organization_id: ctx.organizationId,
    conversation_id: ctx.conversationId,
    lead_id: ctx.leadId,
    inbound_message_id: ctx.inboundMessageId,
    tool_name: "create_follow_up",
    trust: "autonomous",
    status: "executing",
    input_hash: inputHash,
    payload,
    requested_by_user_id: ctx.userId,
    trigger_source: ctx.triggerSource,
    channel_identity_id: ctx.channelIdentityId,
  });

  let action = inserted.action;
  if (inserted.unique) {
    action = await loadByHash({
      organizationId: ctx.organizationId,
      inboundMessageId: ctx.inboundMessageId,
      toolName: "create_follow_up",
      inputHash,
    });
  }

  if (!action) {
    throw new Error("Failed to record AI tool action");
  }

  if (action.status === "executed" && action.result_summary) {
    return action.result_summary;
  }
  if (action.status === "failed") {
    throw new Error("Failed to create follow-up");
  }

  return completeFollowUp(ctx, action, input);
}

export async function requestCreateAppointment(
  ctx: AiToolContext,
  input: CreateAppointmentToolInput
): Promise<Record<string, unknown>> {
  const payload = appointmentPayload(input);
  const inputHash = hashAiToolInput(payload);
  const summary = appointmentPendingSummary(input);
  const expiresAt = new Date(Date.now() + AI_TOOL_ACTION_TTL_MS).toISOString();

  const inserted = await insertAction({
    organization_id: ctx.organizationId,
    conversation_id: ctx.conversationId,
    lead_id: ctx.leadId,
    inbound_message_id: ctx.inboundMessageId,
    tool_name: "create_appointment",
    trust: "human_approval",
    status: "pending",
    input_hash: inputHash,
    payload,
    result_summary: summary,
    requested_by_user_id: ctx.userId,
    trigger_source: ctx.triggerSource,
    channel_identity_id: ctx.channelIdentityId,
    expires_at: expiresAt,
  });

  if (inserted.unique) {
    const existing = await loadByHash({
      organizationId: ctx.organizationId,
      inboundMessageId: ctx.inboundMessageId,
      toolName: "create_appointment",
      inputHash,
    });
    if (!existing) {
      throw new Error("Failed to record AI tool action");
    }
    if (existing.result_summary) {
      return existing.result_summary as Record<string, unknown>;
    }
    return appointmentPendingSummary(input);
  }

  const action = inserted.action;
  if (!action) {
    throw new Error("Failed to record AI tool action");
  }

  await recordLeadActivity({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    leadId: ctx.leadId,
    type: "ai",
    content: aiAppointmentApprovalRequestedContent(),
  });

  logger.info("AI tool executed", {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    tool: "create_appointment",
    outcome: "pending_approval",
    actionId: action.id,
  });

  return summary;
}

async function createAppointmentFromAction(
  organizationId: string,
  approverUserId: string,
  action: AiToolAction
): Promise<AiToolAction> {
  const parsed = createAppointmentToolInputSchema.safeParse(action.payload);
  if (!parsed.success) {
    await markFailed(organizationId, action.id, "VALIDATION_ERROR");
    throw new ValidationError(
      "Invalid appointment data",
      parsed.error.flatten().fieldErrors
    );
  }

  try {
    const appointment = await createAppointment(
      organizationId,
      approverUserId,
      action.lead_id,
      {
        starts_at: parsed.data.startsAt,
        ends_at: parsed.data.endsAt,
        location: parsed.data.location,
        notes: parsed.data.notes,
      },
      { idempotencyKey: action.id }
    );
    const summary = {
      status: "created",
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt ?? null,
      location: parsed.data.location ?? null,
    };
    const updated = await updateAction(organizationId, action.id, {
      status: "executed",
      executed_at: new Date().toISOString(),
      result_resource_type: "appointment",
      result_resource_id: appointment.id,
      result_summary: summary,
      error_code: null,
    });
    if (!updated) {
      throw new Error("Failed to update AI tool action");
    }
    return updated;
  } catch (error) {
    if (error instanceof ValidationError) {
      await markFailed(organizationId, action.id, "VALIDATION_ERROR");
      throw error;
    }
    if (error instanceof NotFoundError) {
      await markFailed(organizationId, action.id, "NOT_FOUND");
      throw error;
    }
    await markFailed(organizationId, action.id, "AI_TOOL_FAILED");
    throw error;
  }
}

export async function approveAiToolAction(
  organizationId: string,
  userId: string,
  actionId: string
): Promise<AiToolAction> {
  await requireOrgMembership(organizationId, userId);

  const current = await loadAiToolActionRow(organizationId, actionId);
  if (!current) {
    throw new NotFoundError("AI tool action");
  }

  if (isAiToolActionExpired(current)) {
    throw new ConflictError("This action has expired");
  }

  const status = effectiveAiToolActionStatus(current);
  if (status === "executed" || status === "rejected" || status === "failed") {
    throw new ConflictError("This action has already been decided");
  }
  if (status === "expired") {
    throw new ConflictError("This action has expired");
  }
  if (current.tool_name !== "create_appointment" || current.trust !== "human_approval") {
    throw new ConflictError("This action cannot be approved");
  }

  if (current.status === "pending") {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claimed = await (supabase.from("ai_tool_actions") as any)
      .update({
        status: "executing",
        approved_by_user_id: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", actionId)
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .select()
      .maybeSingle();

    if (!claimed.data) {
      const raced = await loadAiToolActionRow(organizationId, actionId);
      if (!raced) {
        throw new NotFoundError("AI tool action");
      }
      if (raced.status === "executed") {
        throw new ConflictError("This action has already been decided");
      }
      if (raced.status === "executing") {
        return createAppointmentFromAction(organizationId, userId, raced);
      }
      throw new ConflictError("This action has already been decided");
    }

    logger.info("AI tool executed", {
      organizationId,
      userId,
      tool: "create_appointment",
      outcome: "approved",
      actionId,
    });

    return createAppointmentFromAction(
      organizationId,
      userId,
      claimed.data as AiToolAction
    );
  }

  if (current.status === "executing") {
    return createAppointmentFromAction(organizationId, userId, current);
  }

  throw new ConflictError("This action has already been decided");
}

export async function rejectAiToolAction(
  organizationId: string,
  userId: string,
  actionId: string,
  reason?: string
): Promise<AiToolAction> {
  await requireOrgMembership(organizationId, userId);

  const current = await loadAiToolActionRow(organizationId, actionId);
  if (!current) {
    throw new NotFoundError("AI tool action");
  }

  if (isAiToolActionExpired(current)) {
    throw new ConflictError("This action has expired");
  }
  if (current.status !== "pending") {
    throw new ConflictError("This action has already been decided");
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("ai_tool_actions") as any)
    .update({
      status: "rejected",
      approved_by_user_id: userId,
      decided_at: new Date().toISOString(),
      result_summary: {
        status: "rejected",
        ...(reason ? { reason } : {}),
      },
    })
    .eq("id", actionId)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select()
    .maybeSingle();

  if (error) {
    throw new Error("Failed to reject AI tool action");
  }
  if (!data) {
    throw new ConflictError("This action has already been decided");
  }

  await recordLeadActivity({
    organizationId,
    userId,
    leadId: current.lead_id,
    type: "ai",
    content: aiAppointmentRequestRejectedContent(),
  });

  logger.info("AI tool executed", {
    organizationId,
    userId,
    tool: current.tool_name,
    outcome: "rejected",
    actionId,
  });

  return data as AiToolAction;
}

function customerFactsPayload(
  input: RecordCustomerFactsToolInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }
  return payload;
}

function customerFactsSummary(
  result: Awaited<ReturnType<typeof applyRecordedCustomerFacts>>
): Record<string, unknown> {
  return {
    applied: result.applied,
    skipped: result.skipped,
    appliedFacts: result.appliedFacts,
    priorFacts: result.priorFacts,
    firstName: result.firstName,
    lastName: result.lastName,
    email: result.email,
    phone: result.phone,
    companyName: result.companyName,
    crmQualificationStatus: result.crmQualificationStatus,
    missingRequiredFields: result.missingRequiredFields,
  };
}

async function completeCustomerFacts(
  ctx: AiToolContext,
  action: AiToolAction,
  input: RecordCustomerFactsToolInput
): Promise<Record<string, unknown>> {
  try {
    const recorded = await applyRecordedCustomerFacts(
      ctx.organizationId,
      ctx.userId,
      ctx.leadId,
      input
    );
    const summary = customerFactsSummary(recorded);
    await updateAction(ctx.organizationId, action.id, {
      status: "executed",
      executed_at: new Date().toISOString(),
      result_resource_type: "lead",
      result_resource_id: ctx.leadId,
      result_summary: summary,
      error_code: null,
    });
    logger.info("AI tool executed", {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      tool: "record_customer_facts",
      outcome: "ok",
      actionId: action.id,
    });
    return summary;
  } catch (error) {
    if (error instanceof ValidationError) {
      await markFailed(ctx.organizationId, action.id, "VALIDATION_ERROR");
      throw error;
    }
    if (error instanceof NotFoundError) {
      await markFailed(ctx.organizationId, action.id, "NOT_FOUND");
      throw error;
    }
    await markFailed(ctx.organizationId, action.id, "AI_TOOL_FAILED");
    throw error;
  }
}

export async function executeRecordCustomerFacts(
  ctx: AiToolContext,
  input: RecordCustomerFactsToolInput
): Promise<Record<string, unknown>> {
  const payload = customerFactsPayload(input);
  const inputHash = hashAiToolInput(payload);

  const inserted = await insertAction({
    organization_id: ctx.organizationId,
    conversation_id: ctx.conversationId,
    lead_id: ctx.leadId,
    inbound_message_id: ctx.inboundMessageId,
    tool_name: "record_customer_facts",
    trust: "autonomous",
    status: "executing",
    input_hash: inputHash,
    payload,
    requested_by_user_id: ctx.userId,
    trigger_source: ctx.triggerSource,
    channel_identity_id: ctx.channelIdentityId,
  });

  let action = inserted.action;
  if (inserted.unique) {
    action = await loadByHash({
      organizationId: ctx.organizationId,
      inboundMessageId: ctx.inboundMessageId,
      toolName: "record_customer_facts",
      inputHash,
    });
  }

  if (!action) {
    throw new Error("Failed to record AI tool action");
  }

  if (action.status === "executed" && action.result_summary) {
    return action.result_summary;
  }
  if (action.status === "failed") {
    throw new Error("Failed to record customer facts");
  }

  return completeCustomerFacts(ctx, action, input);
}
