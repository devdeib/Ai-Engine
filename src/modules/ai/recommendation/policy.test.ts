import { describe, it, expect } from "vitest";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import {
  conservativeRecommendation,
  recommend,
} from "@/modules/ai/recommendation/policy";
import { AI_SALES_RECOMMENDATION_ACTIONS } from "@/modules/ai/recommendation/constants";
import type { AiDecision } from "@/modules/ai/types";

const snapshot: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: "2026-08-21T10:00:00Z",
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
};

function payload(
  overrides: Partial<AiSalesAnalysisPayload> = {}
): AiSalesAnalysisPayload {
  return {
    inboundIntent: "general_question",
    objection: "none",
    urgency: "unknown",
    qualification: "unknown",
    inferredStage: "exploring",
    buyingSignals: [],
    missingInformation: [],
    nextBestAction: "provide_information",
    rationale: "Policy matrix fixture.",
    confidence: 0.5,
    ...overrides,
  };
}

describe("recommend policy matrix", () => {
  it("does not overload AiDecision skip/respond", () => {
    const decision: AiDecision = { action: "skip", reason: "paused" };
    const result = recommend(snapshot, payload());
    expect(result.recommendedAction).not.toBe(decision.action);
    expect(AI_SALES_RECOMMENDATION_ACTIONS).not.toContain("skip");
    expect(AI_SALES_RECOMMENDATION_ACTIONS).not.toContain("respond");
  });

  it("defers when requiresHuman is true", () => {
    const result = recommend(
      { ...snapshot, requiresHuman: true },
      payload({ nextBestAction: "create_follow_up" })
    );
    expect(result).toEqual({
      recommendedAction: "defer_existing_control",
      reasonCodes: ["requires_human"],
      requiresHumanApproval: false,
      mappedToolName: null,
    });
  });

  it("defers when aiPaused is true", () => {
    const result = recommend(
      { ...snapshot, aiPaused: true },
      payload({ nextBestAction: "request_appointment_approval" })
    );
    expect(result.recommendedAction).toBe("defer_existing_control");
    expect(result.reasonCodes).toEqual(["conversation_paused"]);
    expect(result.mappedToolName).toBeNull();
  });

  it("includes both control reason codes when paused and requires human", () => {
    const result = recommend(
      { ...snapshot, requiresHuman: true, aiPaused: true },
      payload()
    );
    expect(result.recommendedAction).toBe("defer_existing_control");
    expect(result.reasonCodes).toEqual(["requires_human", "conversation_paused"]);
  });

  it("waits when analysis payload is missing", () => {
    const result = recommend(snapshot, null);
    expect(result).toEqual({
      recommendedAction: "wait_for_customer",
      reasonCodes: ["analysis_unavailable"],
      requiresHumanApproval: false,
      mappedToolName: null,
    });
  });

  it("does not suggest handoff or tools when confidence is low", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "human_handoff", confidence: 0.2 })
    );
    expect(result.recommendedAction).toBe("wait_for_customer");
    expect(result.mappedToolName).toBeNull();
    expect(result.requiresHumanApproval).toBe(false);
  });

  it("never maps appointment or follow-up when confidence is below 0.3", () => {
    const appointment = recommend(
      snapshot,
      payload({ nextBestAction: "request_appointment_approval", confidence: 0.29 })
    );
    expect(appointment.recommendedAction).toBe("wait_for_customer");
    expect(appointment.mappedToolName).toBeNull();
    expect(appointment.reasonCodes).toEqual(["low_confidence", "policy_override"]);

    const followUp = recommend(
      snapshot,
      payload({ nextBestAction: "create_follow_up", confidence: 0.29 })
    );
    expect(followUp.recommendedAction).toBe("wait_for_customer");
    expect(followUp.mappedToolName).toBeNull();
  });

  it("asks a qualification question on low confidence when that was cited", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "ask_qualification_question", confidence: 0.1 })
    );
    expect(result.recommendedAction).toBe("ask_qualification_question");
    expect(result.reasonCodes).toEqual(["low_confidence"]);
    expect(result.mappedToolName).toBeNull();
  });

  it("treats confidence 0.3 as not low", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "create_follow_up", confidence: 0.3 })
    );
    expect(result.recommendedAction).toBe("suggest_follow_up");
    expect(result.mappedToolName).toBe("create_follow_up");
  });

  it("waits when a scheduled appointment already exists", () => {
    const result = recommend(
      { ...snapshot, hasScheduledAppointment: true },
      payload({ nextBestAction: "request_appointment_approval" })
    );
    expect(result.recommendedAction).toBe("wait_for_customer");
    expect(result.mappedToolName).toBeNull();
    expect(result.reasonCodes).toContain("already_has_scheduled_appointment");
    expect(result.reasonCodes).toContain("policy_override");
  });

  it("waits when appointment HITL is already pending", () => {
    const result = recommend(
      { ...snapshot, hasPendingAppointmentApproval: true },
      payload({ nextBestAction: "request_appointment_approval" })
    );
    expect(result.recommendedAction).toBe("wait_for_customer");
    expect(result.mappedToolName).toBeNull();
    expect(result.reasonCodes).toContain(
      "already_has_pending_appointment_approval"
    );
  });

  it("waits when a pending follow-up already exists", () => {
    const result = recommend(
      { ...snapshot, hasPendingFollowUp: true },
      payload({ nextBestAction: "create_follow_up" })
    );
    expect(result.recommendedAction).toBe("wait_for_customer");
    expect(result.mappedToolName).toBeNull();
    expect(result.reasonCodes).toContain("already_has_pending_follow_up");
  });

  it("suggests human handoff without mapping a tool", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "human_handoff" })
    );
    expect(result).toEqual({
      recommendedAction: "suggest_human_handoff",
      reasonCodes: ["cited_model_action"],
      requiresHumanApproval: false,
      mappedToolName: null,
    });
  });

  it("maps a clear appointment citation to HITL hint only", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "request_appointment_approval" })
    );
    expect(result).toEqual({
      recommendedAction: "suggest_appointment_approval",
      reasonCodes: ["cited_model_action"],
      requiresHumanApproval: true,
      mappedToolName: "create_appointment",
    });
  });

  it("maps a clear follow-up citation without human approval", () => {
    const result = recommend(
      snapshot,
      payload({ nextBestAction: "create_follow_up" })
    );
    expect(result).toEqual({
      recommendedAction: "suggest_follow_up",
      reasonCodes: ["cited_model_action"],
      requiresHumanApproval: false,
      mappedToolName: "create_follow_up",
    });
  });

  it("maps remaining informational analysis actions conservatively", () => {
    expect(
      recommend(snapshot, payload({ nextBestAction: "ask_qualification_question" }))
        .recommendedAction
    ).toBe("ask_qualification_question");
    expect(
      recommend(snapshot, payload({ nextBestAction: "provide_information" }))
        .recommendedAction
    ).toBe("provide_information");
    expect(
      recommend(snapshot, payload({ nextBestAction: "wait_for_customer" }))
        .recommendedAction
    ).toBe("wait_for_customer");
  });

  it("keeps reason codes unique and at most 8", () => {
    const result = recommend(
      { ...snapshot, requiresHuman: true, aiPaused: true },
      payload()
    );
    expect(new Set(result.reasonCodes).size).toBe(result.reasonCodes.length);
    expect(result.reasonCodes.length).toBeLessThanOrEqual(8);
  });

  it("never lets the model supply tool mapping or approval", () => {
    const injected = payload({ nextBestAction: "provide_information" });
    const result = recommend(snapshot, injected);
    expect(result.mappedToolName).toBeNull();
    expect(result.requiresHumanApproval).toBe(false);
    expect(result).not.toHaveProperty("organizationId");
    expect(result).not.toHaveProperty("reason_codes");
  });

  it("uses a conservative fallback that does not re-enter recommend", () => {
    expect(conservativeRecommendation(snapshot)).toEqual({
      recommendedAction: "wait_for_customer",
      reasonCodes: ["analysis_unavailable"],
      requiresHumanApproval: false,
      mappedToolName: null,
    });
    expect(
      conservativeRecommendation({ ...snapshot, requiresHuman: true, aiPaused: true })
    ).toEqual({
      recommendedAction: "defer_existing_control",
      reasonCodes: ["requires_human", "conversation_paused"],
      requiresHumanApproval: false,
      mappedToolName: null,
    });
  });
});
