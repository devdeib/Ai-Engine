/**
 * Zod validation schemas for appointments.
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
import type { AppointmentStatus } from "@/lib/db/types";

export const APPOINTMENT_LOCATION_MAX = 500;
export const APPOINTMENT_NOTES_MAX = 2000;

export const appointmentStatusSchema = z.enum([
  "scheduled",
  "completed",
  "cancelled",
] as const satisfies readonly [AppointmentStatus, ...AppointmentStatus[]]);

/** Completing/cancelling is the only client-supplied status change. */
export const appointmentStatusTransitionSchema = z.enum([
  "completed",
  "cancelled",
]);

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export const appointmentTimestampSchema = z
  .string()
  .trim()
  .min(1, "Timestamp is required")
  .refine(isValidTimestamp, "Must be a valid timestamp")
  .transform((value) => new Date(value).toISOString());

const optionalNullableTimestampSchema = z
  .union([appointmentTimestampSchema, z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === "" || value === null) return null;
    return value;
  });

function normalizeEmptyToNull(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

const locationInputSchema = z
  .string()
  .trim()
  .max(
    APPOINTMENT_LOCATION_MAX,
    `Location must be ${APPOINTMENT_LOCATION_MAX} characters or fewer`
  )
  .nullable()
  .optional();

const notesInputSchema = z
  .string()
  .trim()
  .max(
    APPOINTMENT_NOTES_MAX,
    `Notes must be ${APPOINTMENT_NOTES_MAX} characters or fewer`
  )
  .nullable()
  .optional();

function endsAfterStarts(startsAt: string, endsAt: string | null | undefined): boolean {
  if (!endsAt) return true;
  return new Date(endsAt).getTime() > new Date(startsAt).getTime();
}

export const createAppointmentSchema = z
  .object({
    starts_at: appointmentTimestampSchema,
    ends_at: optionalNullableTimestampSchema.transform((value) => value ?? null),
    location: locationInputSchema.transform((value) => normalizeEmptyToNull(value) ?? null),
    notes: notesInputSchema.transform((value) => normalizeEmptyToNull(value) ?? null),
    assigned_user_id: z
      .string()
      .uuid("assigned_user_id must be a valid UUID")
      .nullable()
      .optional(),
  })
  .refine((value) => endsAfterStarts(value.starts_at, value.ends_at), {
    message: "ends_at must be after starts_at",
    path: ["ends_at"],
  });

export const updateAppointmentSchema = z
  .object({
    starts_at: appointmentTimestampSchema.optional(),
    ends_at: optionalNullableTimestampSchema,
    location: locationInputSchema.transform(normalizeEmptyToNull),
    notes: notesInputSchema.transform(normalizeEmptyToNull),
    assigned_user_id: z
      .string()
      .uuid("assigned_user_id must be a valid UUID")
      .nullable()
      .optional(),
    status: appointmentStatusTransitionSchema.optional(),
  })
  .refine(
    (value) =>
      value.starts_at !== undefined ||
      value.ends_at !== undefined ||
      value.location !== undefined ||
      value.notes !== undefined ||
      value.assigned_user_id !== undefined ||
      value.status !== undefined,
    { message: "At least one field is required" }
  )
  .refine(
    (value) => {
      if (value.starts_at === undefined || value.ends_at === undefined) {
        return true;
      }
      return endsAfterStarts(value.starts_at, value.ends_at);
    },
    {
      message: "ends_at must be after starts_at",
      path: ["ends_at"],
    }
  );

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
