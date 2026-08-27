export const AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE = "Follow up";

export const AI_SALES_RECOMMENDATION_FOLLOW_UP_OFFSET_MS = 24 * 60 * 60 * 1000;

export const AI_SALES_RECOMMENDATION_EXECUTION_TOOL = "create_follow_up" as const;

export const INBOUND_FOLLOW_UP_ACTION_STATUSES = [
  "pending",
  "executing",
  "executed",
] as const;
