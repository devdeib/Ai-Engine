/**
 * Strict Zod schema for advisory sales analysis. Server-owned versions are
 * never accepted from the model.
 */
import { z } from "zod";

export const AI_SALES_ANALYSIS_INBOUND_INTENTS = [
  "pricing",
  "availability",
  "product_details",
  "appointment",
  "negotiation",
  "comparison",
  "general_question",
  "not_interested",
  "unclear",
] as const;

export const AI_SALES_ANALYSIS_OBJECTIONS = [
  "price",
  "timing",
  "trust",
  "location",
  "product_fit",
  "none",
] as const;

export const AI_SALES_ANALYSIS_URGENCIES = [
  "low",
  "medium",
  "high",
  "unknown",
] as const;

export const AI_SALES_ANALYSIS_QUALIFICATIONS = [
  "insufficient_info",
  "qualifying",
  "qualified",
  "disqualified",
  "unknown",
] as const;

export const AI_SALES_ANALYSIS_STAGES = [
  "exploring",
  "qualifying",
  "ready_for_appointment",
  "awaiting_appointment",
  "negotiating",
  "disengaging",
  "unclear",
] as const;

export const AI_SALES_ANALYSIS_BUYING_SIGNALS = [
  "asking_price",
  "asking_availability",
  "asking_viewing",
  "mentioning_timeline",
  "mentioning_budget",
  "comparing_options",
] as const;

export const AI_SALES_ANALYSIS_MISSING_INFORMATION = [
  "budget",
  "timeline",
  "location",
  "property_type",
  "financing",
  "decision_maker",
] as const;

export const AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS = [
  "ask_qualification_question",
  "provide_information",
  "create_follow_up",
  "request_appointment_approval",
  "human_handoff",
  "wait_for_customer",
] as const;

function uniqueRequiredArray<T extends readonly [string, ...string[]]>(
  values: T,
  max: number
) {
  return z
    .array(z.enum(values))
    .max(max)
    .refine((items) => new Set(items).size === items.length, {
      message: "Array values must be unique",
    });
}

export const aiSalesAnalysisPayloadSchema = z
  .object({
    inboundIntent: z.enum(AI_SALES_ANALYSIS_INBOUND_INTENTS),
    objection: z.enum(AI_SALES_ANALYSIS_OBJECTIONS),
    urgency: z.enum(AI_SALES_ANALYSIS_URGENCIES),
    qualification: z.enum(AI_SALES_ANALYSIS_QUALIFICATIONS),
    inferredStage: z.enum(AI_SALES_ANALYSIS_STAGES),
    buyingSignals: uniqueRequiredArray(AI_SALES_ANALYSIS_BUYING_SIGNALS, 4),
    missingInformation: uniqueRequiredArray(
      AI_SALES_ANALYSIS_MISSING_INFORMATION,
      6
    ),
    nextBestAction: z.enum(AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS),
    rationale: z.string().trim().min(1).max(240),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();

export type AiSalesAnalysisPayload = z.infer<typeof aiSalesAnalysisPayloadSchema>;

export function validateAiSalesAnalysis(
  raw: unknown
): AiSalesAnalysisPayload | null {
  const result = aiSalesAnalysisPayloadSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export const pipelineSnapshotSchema = z
  .object({
    leadStatus: z.enum([
      "new",
      "contacted",
      "qualified",
      "unqualified",
      "lost",
      "converted",
    ]),
    conversationStatus: z.enum(["open", "closed"]),
    requiresHuman: z.boolean(),
    aiPaused: z.boolean(),
    latestMessageDirection: z.enum(["inbound", "outbound"]),
    lastInboundAt: z.string().nullable(),
    lastOutboundAt: z.string().nullable(),
    hasScheduledAppointment: z.boolean(),
    hasPendingFollowUp: z.boolean(),
    hasPendingAppointmentApproval: z.boolean(),
    contactEmailPresent: z.boolean(),
    contactPhonePresent: z.boolean(),
  })
  .strict();

export const listAiSalesAnalysesQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(1),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(20),
});

export const AI_SALES_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "inboundIntent",
    "objection",
    "urgency",
    "qualification",
    "inferredStage",
    "buyingSignals",
    "missingInformation",
    "nextBestAction",
    "rationale",
    "confidence",
  ],
  properties: {
    inboundIntent: { type: "string", enum: [...AI_SALES_ANALYSIS_INBOUND_INTENTS] },
    objection: { type: "string", enum: [...AI_SALES_ANALYSIS_OBJECTIONS] },
    urgency: { type: "string", enum: [...AI_SALES_ANALYSIS_URGENCIES] },
    qualification: {
      type: "string",
      enum: [...AI_SALES_ANALYSIS_QUALIFICATIONS],
    },
    inferredStage: { type: "string", enum: [...AI_SALES_ANALYSIS_STAGES] },
    buyingSignals: {
      type: "array",
      maxItems: 4,
      items: { type: "string", enum: [...AI_SALES_ANALYSIS_BUYING_SIGNALS] },
    },
    missingInformation: {
      type: "array",
      maxItems: 6,
      items: {
        type: "string",
        enum: [...AI_SALES_ANALYSIS_MISSING_INFORMATION],
      },
    },
    nextBestAction: {
      type: "string",
      enum: [...AI_SALES_ANALYSIS_NEXT_BEST_ACTIONS],
    },
    rationale: { type: "string", minLength: 1, maxLength: 240 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};
