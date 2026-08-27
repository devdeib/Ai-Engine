/**
 * Deterministic next-best-action policy. No LLM. No CRM/tool execution.
 * Inputs are the server snapshot and a Zod-validated 4.6 payload only.
 */
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_LOW_CONFIDENCE } from "@/modules/ai/recommendation/constants";
import type {
  AiSalesRecommendationDecision,
  AiSalesRecommendationReasonCode,
} from "@/modules/ai/recommendation/schema";

function uniqueCodes(
  codes: AiSalesRecommendationReasonCode[]
): AiSalesRecommendationReasonCode[] {
  return [...new Set(codes)].slice(0, 8);
}

function informational(
  action: Extract<
    AiSalesRecommendationDecision["recommendedAction"],
    "ask_qualification_question" | "provide_information" | "wait_for_customer"
  >,
  codes: AiSalesRecommendationReasonCode[]
): AiSalesRecommendationDecision {
  return {
    recommendedAction: action,
    reasonCodes: uniqueCodes(codes),
    requiresHumanApproval: false,
    mappedToolName: null,
  };
}

export function recommend(
  snapshot: AiPipelineSnapshot,
  analysisPayload: AiSalesAnalysisPayload | null
): AiSalesRecommendationDecision {
  if (snapshot.requiresHuman || snapshot.aiPaused) {
    const codes: AiSalesRecommendationReasonCode[] = [];
    if (snapshot.requiresHuman) codes.push("requires_human");
    if (snapshot.aiPaused) codes.push("conversation_paused");
    return {
      recommendedAction: "defer_existing_control",
      reasonCodes: uniqueCodes(codes),
      requiresHumanApproval: false,
      mappedToolName: null,
    };
  }

  if (!analysisPayload) {
    return informational("wait_for_customer", ["analysis_unavailable"]);
  }

  const cited = analysisPayload.nextBestAction;

  if (analysisPayload.confidence < AI_SALES_RECOMMENDATION_LOW_CONFIDENCE) {
    const codes: AiSalesRecommendationReasonCode[] = ["low_confidence"];
    if (
      cited === "create_follow_up" ||
      cited === "request_appointment_approval" ||
      cited === "human_handoff"
    ) {
      codes.push("policy_override");
    }
    if (cited === "ask_qualification_question") {
      return informational("ask_qualification_question", codes);
    }
    return informational("wait_for_customer", codes);
  }

  if (cited === "request_appointment_approval") {
    if (snapshot.hasScheduledAppointment) {
      return informational("wait_for_customer", [
        "already_has_scheduled_appointment",
        "policy_override",
      ]);
    }
    if (snapshot.hasPendingAppointmentApproval) {
      return informational("wait_for_customer", [
        "already_has_pending_appointment_approval",
        "policy_override",
      ]);
    }
    return {
      recommendedAction: "suggest_appointment_approval",
      reasonCodes: uniqueCodes(["cited_model_action"]),
      requiresHumanApproval: true,
      mappedToolName: "create_appointment",
    };
  }

  if (cited === "create_follow_up") {
    if (snapshot.hasPendingFollowUp) {
      return informational("wait_for_customer", [
        "already_has_pending_follow_up",
        "policy_override",
      ]);
    }
    return {
      recommendedAction: "suggest_follow_up",
      reasonCodes: uniqueCodes(["cited_model_action"]),
      requiresHumanApproval: false,
      mappedToolName: "create_follow_up",
    };
  }

  if (cited === "human_handoff") {
    return {
      recommendedAction: "suggest_human_handoff",
      reasonCodes: uniqueCodes(["cited_model_action"]),
      requiresHumanApproval: false,
      mappedToolName: null,
    };
  }

  if (cited === "ask_qualification_question") {
    return informational("ask_qualification_question", ["cited_model_action"]);
  }
  if (cited === "provide_information") {
    return informational("provide_information", ["cited_model_action"]);
  }
  return informational("wait_for_customer", ["cited_model_action"]);
}

export function conservativeRecommendation(
  snapshot: AiPipelineSnapshot
): AiSalesRecommendationDecision {
  if (snapshot.requiresHuman || snapshot.aiPaused) {
    const codes: AiSalesRecommendationReasonCode[] = [];
    if (snapshot.requiresHuman) codes.push("requires_human");
    if (snapshot.aiPaused) codes.push("conversation_paused");
    return {
      recommendedAction: "defer_existing_control",
      reasonCodes: uniqueCodes(codes),
      requiresHumanApproval: false,
      mappedToolName: null,
    };
  }
  return informational("wait_for_customer", ["analysis_unavailable"]);
}
