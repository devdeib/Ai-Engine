/**
 * Internal AI domain types. Actor identity is never accepted from the client.
 */
import type { AppointmentStatus, LeadFollowUpStatus, LeadStatus } from "@/lib/db/types";

export type AiActor = "human" | "ai" | "system";

export type AiSkipReason =
  | "closed"
  | "paused"
  | "requires_human"
  | "no_inbound"
  | "latest_outbound"
  | "already_replied";

export type AiDecision =
  | { action: "respond"; inboundMessageId: string }
  | { action: "skip"; reason: AiSkipReason };

export interface AiSafetyState {
  status: "open" | "closed";
  requiresHuman: boolean;
  aiPausedAt: string | null;
}

export interface AiLeadContext {
  firstName: string;
  lastName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatus;
  score: number | null;
  notes: string | null;
}

export interface AiConversationContext {
  channel: string;
  status: "open" | "closed";
  requiresHuman: boolean;
  aiPausedAt: string | null;
}

export interface AiMessageContext {
  direction: "inbound" | "outbound";
  authorType: "human" | "ai" | "system";
  body: string;
  createdAt: string;
}

export interface AiFollowUpContext {
  title: string;
  status: LeadFollowUpStatus;
  dueAt: string;
}

export interface AiAppointmentContext {
  status: AppointmentStatus;
  startsAt: string;
  location: string | null;
}

export interface AiActivityContext {
  type: string;
  content: string;
  createdAt: string;
}

export interface AiOrganizationContext {
  name: string;
}

export interface AiContext {
  organization: AiOrganizationContext;
  lead: AiLeadContext;
  conversation: AiConversationContext;
  messages: AiMessageContext[];
  followUps: AiFollowUpContext[];
  appointments: AiAppointmentContext[];
  recentActivities: AiActivityContext[];
}

export interface AiProviderRequest {
  systemPrompt: string;
  promptVersion: string;
  context: AiContext;
}

export interface AiProviderResponse {
  text: string;
}

export interface AiExecutionResult {
  outcome: "responded" | "skipped";
  reason?: AiSkipReason;
  messageId?: string;
}

export const AI_CONTEXT_MESSAGE_LIMIT = 20;
export const AI_CONTEXT_SIDE_LIMIT = 5;
export const AI_DEFAULT_TIMEOUT_MS = 15_000;
export const AI_DEFAULT_MAX_OUTPUT_TOKENS = 400;
export const SALES_AGENT_PROMPT_VERSION = "SALES_AGENT_PROMPT_V1";
