/**
 * Trusted identifiers stored on an AI execution job.
 * The worker reloads conversation state from the database.
 */
export interface AiExecutionJobPayload {
  organizationId: string;
  conversationId: string;
  inboundMessageId: string;
  requestedByUserId: string | null;
  triggerSource: "operator" | "channel_ingress";
  channelIdentityId: string | null;
}

export const AI_EXECUTION_JOB_INSERT_KEYS = [
  "organization_id",
  "conversation_id",
  "inbound_message_id",
  "requested_by_user_id",
  "trigger_source",
  "channel_identity_id",
  "status",
  "max_attempts",
] as const;
