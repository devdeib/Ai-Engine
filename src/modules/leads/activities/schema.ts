/**
 * Zod validation schemas for lead activities.
 *
 * IMPORTANT: organization_id, lead_id, and user_id are NEVER included here.
 * - organization_id comes from the verified server-side URL context.
 * - lead_id comes from the verified URL path parameter.
 * - user_id comes from the authenticated session.
 *
 * Public POST (createActivitySchema) accepts only manually logged CRM types.
 * Internal recording (recordActivitySchema) also accepts conversation,
 * follow_up, and appointment — those are written by domain mutations, not
 * by the browser.
 */
import { z } from "zod";
import type { LeadActivityType } from "@/lib/db/types";

export const ACTIVITY_CONTENT_MAX = 2000;

export const MANUAL_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
  "status_change",
] as const satisfies readonly [LeadActivityType, ...LeadActivityType[]];

export const LEAD_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
  "status_change",
  "conversation",
  "follow_up",
  "appointment",
  "ai",
] as const satisfies readonly [LeadActivityType, ...LeadActivityType[]];

export const manualActivityTypeSchema = z.enum(MANUAL_ACTIVITY_TYPES);

export const leadActivityTypeSchema = z.enum(LEAD_ACTIVITY_TYPES);

export type ManualActivityType = z.infer<typeof manualActivityTypeSchema>;

export const createActivitySchema = z.object({
  type: manualActivityTypeSchema,

  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(
      ACTIVITY_CONTENT_MAX,
      `Content must be ${ACTIVITY_CONTENT_MAX} characters or fewer`
    ),
});

/**
 * Internal recording schema. Truncates derived content rather than failing
 * the parent CRM mutation solely because a generated string is too long.
 */
export const recordActivitySchema = z.object({
  type: leadActivityTypeSchema,
  content: z
    .string()
    .trim()
    .min(1, "Content is required")
    .transform((value) => boundActivityContent(value)),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type RecordActivityInput = z.infer<typeof recordActivitySchema>;

export function boundActivityContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= ACTIVITY_CONTENT_MAX) return trimmed;
  return trimmed.slice(0, ACTIVITY_CONTENT_MAX);
}
