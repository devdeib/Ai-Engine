import { describe, it, expect } from "vitest";
import { QUALIFICATION_FACT_VALUE_MAX } from "@/modules/leads/qualification";
import { operatorQualificationFactsSchema } from "@/modules/leads/qualification-schema";

describe("operatorQualificationFactsSchema", () => {
  it("accepts a partial facts patch", () => {
    const parsed = operatorQualificationFactsSchema.safeParse({
      facts: { budget: "200k" },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts null to clear a fact", () => {
    const parsed = operatorQualificationFactsSchema.safeParse({
      facts: { timeline: null },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects missing facts", () => {
    expect(operatorQualificationFactsSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty facts object", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({ facts: {} }).success
    ).toBe(false);
  });

  it("rejects unknown fact keys", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({
        facts: { wealth: "high" },
      }).success
    ).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({
        facts: { budget: "200k" },
        status: "qualified",
      }).success
    ).toBe(false);
  });

  it("rejects overlong values", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({
        facts: { budget: "x".repeat(QUALIFICATION_FACT_VALUE_MAX + 1) },
      }).success
    ).toBe(false);
  });

  it("accepts values at the existing maximum length", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({
        facts: { budget: "x".repeat(QUALIFICATION_FACT_VALUE_MAX) },
      }).success
    ).toBe(true);
  });

  it("rejects non-string non-null values", () => {
    expect(
      operatorQualificationFactsSchema.safeParse({
        facts: { budget: 20000 },
      }).success
    ).toBe(false);
  });
});
