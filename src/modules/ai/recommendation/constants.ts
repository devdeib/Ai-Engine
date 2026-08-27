export const AI_SALES_RECOMMENDATION_POLICY_V1 =
  "AI_SALES_RECOMMENDATION_POLICY_V1";

export const AI_SALES_RECOMMENDATION_LOW_CONFIDENCE = 0.3;

export const AI_SALES_RECOMMENDATION_ACTIONS = [
  "ask_qualification_question",
  "provide_information",
  "suggest_follow_up",
  "suggest_appointment_approval",
  "suggest_human_handoff",
  "wait_for_customer",
  "defer_existing_control",
] as const;

export const AI_SALES_RECOMMENDATION_REASON_CODES = [
  "analysis_unavailable",
  "low_confidence",
  "already_has_scheduled_appointment",
  "already_has_pending_follow_up",
  "already_has_pending_appointment_approval",
  "conversation_paused",
  "requires_human",
  "cited_model_action",
  "policy_override",
] as const;

export const AI_SALES_RECOMMENDATION_MAPPED_TOOLS = [
  "create_follow_up",
  "create_appointment",
] as const;
