/**
 * Zod validation schemas for lead follow-ups.
 *
 * NEVER accepted from the client:
 * - organization_id (verified URL / session context)
 * - lead_id on the lead-scoped POST (URL path)
 * - user_id / created_by
 *
 * assigned_user_id is the only identity field the client may request.
 * Membership is verified in the domain layer with isMemberOfOrg().
 */
import { z } from "zod";
import type { LeadFollowUpStatus } from "@/lib/db/types";

export const FOLLOW_UP_TITLE_MAX = 200;
export const FOLLOW_UP_NOTES_MAX = 2000;

export const leadFollowUpStatusSchema = z.enum([
  "pending",
  "completed",
  "cancelled",
] as const satisfies readonly [LeadFollowUpStatus, ...LeadFollowUpStatus[]]);

/** Completing/cancelling is the only client-supplied status change. */
export const followUpStatusTransitionSchema = z.enum([
  "completed",
  "cancelled",
]);

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export const followUpDueAtSchema = z
  .string()
  .trim()
  .min(1, "Due date is required")
  .refine(isValidTimestamp, "due_at must be a valid timestamp");

const followUpTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(
    FOLLOW_UP_TITLE_MAX,
    `Title must be ${FOLLOW_UP_TITLE_MAX} characters or fewer`
  );

const followUpNotesInputSchema = z
  .string()
  .trim()
  .max(
    FOLLOW_UP_NOTES_MAX,
    `Notes must be ${FOLLOW_UP_NOTES_MAX} characters or fewer`
  )
  .nullable()
  .optional();

function normalizeNotes(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

export const createFollowUpSchema = z.object({
  title: followUpTitleSchema,
  notes: followUpNotesInputSchema.transform(
    (value) => normalizeNotes(value) ?? null
  ),
  due_at: followUpDueAtSchema.transform((value) =>
    new Date(value).toISOString()
  ),
  assigned_user_id: z
    .string()
    .uuid("assigned_user_id must be a valid UUID")
    .nullable()
    .optional(),
});

export const updateFollowUpSchema = z
  .object({
    title: followUpTitleSchema.optional(),
    notes: followUpNotesInputSchema.transform(normalizeNotes),
    due_at: followUpDueAtSchema.transform((value) =>
      new Date(value).toISOString()
    ).optional(),
    assigned_user_id: z
      .string()
      .uuid("assigned_user_id must be a valid UUID")
      .nullable()
      .optional(),
    status: followUpStatusTransitionSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.notes !== undefined ||
      value.due_at !== undefined ||
      value.assigned_user_id !== undefined ||
      value.status !== undefined,
    { message: "At least one field is required" }
  );

export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
