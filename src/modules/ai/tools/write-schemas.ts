import { z } from "zod";
import {
  FOLLOW_UP_NOTES_MAX,
  FOLLOW_UP_TITLE_MAX,
  followUpDueAtSchema,
} from "@/modules/follow-ups/schema";
import {
  APPOINTMENT_LOCATION_MAX,
  APPOINTMENT_NOTES_MAX,
  appointmentTimestampSchema,
} from "@/modules/appointments/schema";

function normalizeEmptyToNull(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return value;
}

export const createFollowUpToolInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(
        FOLLOW_UP_TITLE_MAX,
        `Title must be ${FOLLOW_UP_TITLE_MAX} characters or fewer`
      ),
    notes: z
      .string()
      .trim()
      .max(
        FOLLOW_UP_NOTES_MAX,
        `Notes must be ${FOLLOW_UP_NOTES_MAX} characters or fewer`
      )
      .nullable()
      .optional()
      .transform((value) => normalizeEmptyToNull(value) ?? null),
    dueAt: followUpDueAtSchema.transform((value) =>
      new Date(value).toISOString()
    ),
  })
  .strict();

export const createFollowUpToolOutputSchema = z
  .object({
    status: z.literal("created"),
    title: z.string(),
    dueAt: z.string(),
  })
  .strict();

export const createAppointmentToolInputSchema = z
  .object({
    startsAt: appointmentTimestampSchema,
    endsAt: z
      .union([appointmentTimestampSchema, z.literal(""), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return null;
        if (value === "" || value === null) return null;
        return value;
      }),
    location: z
      .string()
      .trim()
      .max(
        APPOINTMENT_LOCATION_MAX,
        `Location must be ${APPOINTMENT_LOCATION_MAX} characters or fewer`
      )
      .nullable()
      .optional()
      .transform((value) => normalizeEmptyToNull(value) ?? null),
    notes: z
      .string()
      .trim()
      .max(
        APPOINTMENT_NOTES_MAX,
        `Notes must be ${APPOINTMENT_NOTES_MAX} characters or fewer`
      )
      .nullable()
      .optional()
      .transform((value) => normalizeEmptyToNull(value) ?? null),
  })
  .strict()
  .refine(
    (value) =>
      value.endsAt === null ||
      new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(),
    {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }
  );

export const createAppointmentToolOutputSchema = z
  .object({
    status: z.literal("pending_approval"),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    location: z.string().nullable(),
  })
  .strict();

export type CreateFollowUpToolInput = z.infer<typeof createFollowUpToolInputSchema>;
export type CreateAppointmentToolInput = z.infer<
  typeof createAppointmentToolInputSchema
>;

export const CREATE_FOLLOW_UP_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    title: { type: "string" },
    notes: { type: ["string", "null"] },
    dueAt: { type: "string", description: "ISO-8601 datetime" },
  },
  required: ["title", "dueAt"],
  additionalProperties: false,
};

export const CREATE_APPOINTMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    startsAt: { type: "string", description: "ISO-8601 datetime" },
    endsAt: { type: ["string", "null"], description: "ISO-8601 datetime" },
    location: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
  },
  required: ["startsAt"],
  additionalProperties: false,
};
