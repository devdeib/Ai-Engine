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
import {
  QUALIFICATION_FACT_KEYS,
  QUALIFICATION_FACT_VALUE_MAX,
  QUALIFICATION_STATUSES,
  MISSING_REQUIRED_FIELD_ORDER,
} from "@/modules/leads/qualification";

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

const factValueSchema = z
  .string()
  .trim()
  .min(1, "Fact value is required")
  .max(
    QUALIFICATION_FACT_VALUE_MAX,
    `Fact value must be ${QUALIFICATION_FACT_VALUE_MAX} characters or fewer`
  );

export const recordCustomerFactsToolInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("A valid email address is required")
      .max(255, "Email must be 255 characters or fewer")
      .optional(),
    phone: z
      .string()
      .trim()
      .min(1, "Phone is required")
      .max(30, "Phone must be 30 characters or fewer")
      .optional(),
    company_name: z
      .string()
      .trim()
      .min(1, "Company name is required")
      .max(255, "Company name must be 255 characters or fewer")
      .optional(),
    first_name: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(100, "First name must be 100 characters or fewer")
      .optional(),
    last_name: z
      .string()
      .trim()
      .min(1, "Last name is required")
      .max(100, "Last name must be 100 characters or fewer")
      .optional(),
    budget: factValueSchema.optional(),
    timeline: factValueSchema.optional(),
    location: factValueSchema.optional(),
    property_type: factValueSchema.optional(),
    financing: factValueSchema.optional(),
    decision_maker: factValueSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.email !== undefined ||
      value.phone !== undefined ||
      value.company_name !== undefined ||
      value.first_name !== undefined ||
      value.last_name !== undefined ||
      QUALIFICATION_FACT_KEYS.some((key) => value[key] !== undefined),
    { message: "At least one customer fact is required" }
  );

export const recordCustomerFactsToolOutputSchema = z
  .object({
    applied: z.array(z.string()),
    skipped: z.array(
      z
        .object({
          field: z.string(),
          reason: z.enum(["already_set", "not_stub"]),
        })
        .strict()
    ),
    knownFacts: z.record(z.string(), z.string()),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    companyName: z.string().nullable(),
    qualificationStatus: z.enum(QUALIFICATION_STATUSES),
    missingRequiredFields: z.array(z.enum(MISSING_REQUIRED_FIELD_ORDER)),
  })
  .strict();

export type RecordCustomerFactsToolInput = z.infer<
  typeof recordCustomerFactsToolInputSchema
>;
export type RecordCustomerFactsToolOutput = z.infer<
  typeof recordCustomerFactsToolOutputSchema
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

export const RECORD_CUSTOMER_FACTS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    email: { type: "string" },
    phone: { type: "string" },
    company_name: { type: "string" },
    first_name: { type: "string" },
    last_name: { type: "string" },
    budget: { type: "string" },
    timeline: { type: "string" },
    location: { type: "string" },
    property_type: { type: "string" },
    financing: { type: "string" },
    decision_maker: { type: "string" },
  },
  additionalProperties: false,
};
