/**
 * Operator qualification-fact write schema.
 * Strict allowlist — unknown keys are rejected, never stripped.
 */
import { z } from "zod";
import {
  QUALIFICATION_FACT_KEYS,
  QUALIFICATION_FACT_VALUE_MAX,
  type QualificationFactKey,
} from "@/modules/leads/qualification";

const operatorFactValueSchema = z.union([
  z
    .string()
    .max(
      QUALIFICATION_FACT_VALUE_MAX,
      `Fact value must be ${QUALIFICATION_FACT_VALUE_MAX} characters or fewer`
    ),
  z.null(),
]);

const operatorFactsObjectSchema = z
  .object({
    budget: operatorFactValueSchema.optional(),
    timeline: operatorFactValueSchema.optional(),
    location: operatorFactValueSchema.optional(),
    property_type: operatorFactValueSchema.optional(),
    financing: operatorFactValueSchema.optional(),
    decision_maker: operatorFactValueSchema.optional(),
  })
  .strict()
  .refine(
    (facts) => QUALIFICATION_FACT_KEYS.some((key) => facts[key] !== undefined),
    { message: "At least one qualification fact is required" }
  );

export const operatorQualificationFactsSchema = z
  .object({
    facts: operatorFactsObjectSchema,
  })
  .strict();

export type OperatorQualificationFactsInput = z.infer<
  typeof operatorQualificationFactsSchema
>;

export type OperatorQualificationFactsPatch = Partial<
  Record<QualificationFactKey, string | null>
>;
