export const ACTION_CENTER_DEFAULT_LIMIT = 20;
export const ACTION_CENTER_MAX_LIMIT = 100;
export const ACTION_CENTER_CANDIDATE_MULTIPLIER = 5;

export const ACTION_CENTER_ACTIONABLE_ACTIONS = [
  "suggest_appointment_approval",
  "suggest_human_handoff",
] as const;

export type ActionCenterActionableAction =
  (typeof ACTION_CENTER_ACTIONABLE_ACTIONS)[number];

export function actionCenterCandidateLimit(limit: number): number {
  return Math.min(
    ACTION_CENTER_MAX_LIMIT,
    limit * ACTION_CENTER_CANDIDATE_MULTIPLIER
  );
}

export function actionCenterConversationHref(conversationId: string): string {
  return `/dashboard/conversations?conversation=${conversationId}`;
}
