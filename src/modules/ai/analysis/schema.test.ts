import { describe, it, expect } from "vitest";
import {
  validateAiSalesAnalysis,
  aiSalesAnalysisPayloadSchema,
} from "@/modules/ai/analysis/schema";

const valid = {
  inboundIntent: "pricing",
  objection: "none",
  urgency: "medium",
  qualification: "qualifying",
  inferredStage: "exploring",
  buyingSignals: ["asking_price"],
  missingInformation: ["budget"],
  nextBestAction: "provide_information",
  rationale: "Lead asked about price without sharing a budget.",
  confidence: 0.7,
};

describe("aiSalesAnalysisPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = aiSalesAnalysisPayloadSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(validateAiSalesAnalysis(valid)).toEqual(valid);
  });

  it("rejects an unknown enum value", () => {
    expect(
      validateAiSalesAnalysis({ ...valid, inboundIntent: "jailbreak" })
    ).toBeNull();
  });

  it("rejects unknown keys", () => {
    expect(validateAiSalesAnalysis({ ...valid, extra: true })).toBeNull();
  });

  it("rejects identity and control fields", () => {
    const injections = [
      { organizationId: "org" },
      { leadId: "lead" },
      { userId: "user" },
      { conversationId: "conv" },
      { status: "converted" },
      { score: 99 },
      { actionId: "action" },
      { assigned_user_id: "user" },
      { schema_version: "AI_SALES_ANALYSIS_V9" },
      { prompt_version: "hacked" },
    ];
    for (const extra of injections) {
      expect(validateAiSalesAnalysis({ ...valid, ...extra })).toBeNull();
    }
  });

  it("rejects malformed arrays", () => {
    expect(
      validateAiSalesAnalysis({ ...valid, buyingSignals: "asking_price" })
    ).toBeNull();
  });

  it("rejects duplicate array values", () => {
    expect(
      validateAiSalesAnalysis({
        ...valid,
        buyingSignals: ["asking_price", "asking_price"],
      })
    ).toBeNull();
  });

  it("rejects more than 4 buyingSignals", () => {
    expect(
      validateAiSalesAnalysis({
        ...valid,
        buyingSignals: [
          "asking_price",
          "asking_availability",
          "asking_viewing",
          "mentioning_timeline",
          "mentioning_budget",
        ],
      })
    ).toBeNull();
  });

  it("rejects more than 6 missingInformation values", () => {
    expect(
      validateAiSalesAnalysis({
        ...valid,
        missingInformation: [
          "budget",
          "timeline",
          "location",
          "property_type",
          "financing",
          "decision_maker",
          "budget",
        ],
      })
    ).toBeNull();
  });

  it("rejects confidence below 0", () => {
    expect(validateAiSalesAnalysis({ ...valid, confidence: -0.1 })).toBeNull();
  });

  it("rejects confidence above 1", () => {
    expect(validateAiSalesAnalysis({ ...valid, confidence: 1.01 })).toBeNull();
  });

  it("rejects NaN confidence", () => {
    expect(validateAiSalesAnalysis({ ...valid, confidence: Number.NaN })).toBeNull();
  });

  it("rejects confidence 50", () => {
    expect(validateAiSalesAnalysis({ ...valid, confidence: 50 })).toBeNull();
  });

  it("rejects an oversized rationale", () => {
    expect(
      validateAiSalesAnalysis({ ...valid, rationale: "x".repeat(241) })
    ).toBeNull();
  });

  it("rejects send_message as nextBestAction", () => {
    expect(
      validateAiSalesAnalysis({ ...valid, nextBestAction: "send_message" })
    ).toBeNull();
  });

  it("rejects omitted required arrays instead of defaulting them", () => {
    const { buyingSignals: _signals, ...rest } = valid;
    expect(validateAiSalesAnalysis(rest)).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(() => validateAiSalesAnalysis(undefined)).not.toThrow();
    expect(validateAiSalesAnalysis(undefined)).toBeNull();
  });
});
