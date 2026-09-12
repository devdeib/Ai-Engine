/**
 * Internal AI domain types. Actor identity is never accepted from the client.
 */
import type { AppointmentStatus, LeadFollowUpStatus, LeadStatus } from "@/lib/db/types";
import type {
  MissingRequiredField,
  QualificationFacts,
  QualificationStatus,
} from "@/modules/leads/qualification";

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
  qualificationFacts: QualificationFacts;
  qualificationStatus: QualificationStatus;
  missingRequiredFields: MissingRequiredField[];
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

export interface AiSalesProfileContext {
  offeringSummary: string | null;
  serviceArea: string | null;
  qualificationCriteria: string | null;
  constraints: string | null;
  typicalNextStep: string | null;
}

export const EMPTY_AI_SALES_PROFILE: AiSalesProfileContext = {
  offeringSummary: null,
  serviceArea: null,
  qualificationCriteria: null,
  constraints: null,
  typicalNextStep: null,
};

export interface AiOrganizationContext {
  name: string;
  salesProfile: AiSalesProfileContext;
}

export interface AiPipelineSnapshot {
  leadStatus: LeadStatus;
  conversationStatus: "open" | "closed";
  requiresHuman: boolean;
  aiPaused: boolean;
  latestMessageDirection: "inbound" | "outbound";
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  hasScheduledAppointment: boolean;
  hasPendingFollowUp: boolean;
  hasPendingAppointmentApproval: boolean;
  contactEmailPresent: boolean;
  contactPhonePresent: boolean;
}

export interface AiContext {
  organization: AiOrganizationContext;
  lead: AiLeadContext;
  conversation: AiConversationContext;
  messages: AiMessageContext[];
  followUps: AiFollowUpContext[];
  appointments: AiAppointmentContext[];
  recentActivities: AiActivityContext[];
  pipeline: AiPipelineSnapshot;
}

export const AI_CONTEXT_MESSAGE_LIMIT = 20;
export const AI_CONTEXT_SIDE_LIMIT = 5;
export const AI_DEFAULT_TIMEOUT_MS = 15_000;
export const AI_DEFAULT_MAX_OUTPUT_TOKENS = 400;
export const AI_MAX_TOOL_CALLS = 2;
export const SALES_AGENT_PROMPT_VERSION = "SALES_AGENT_PROMPT_V3";
export const AI_TOOL_ACTION_TTL_MS = 24 * 60 * 60 * 1000;

export const AI_TOOL_NAMES = [
  "get_lead_context",
  "get_conversation_history",
  "get_lead_appointments",
  "get_lead_follow_ups",
  "create_follow_up",
  "create_appointment",
  "record_customer_facts",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

export interface AiToolDescriptor {
  name: AiToolName;
  description: string;
  inputJsonSchema: Record<string, unknown>;
}

export type AiProviderTurn =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: unknown };

/**
 * Text-only provider result. `{ text }` remains valid; the service normalizes
 * it to `{ type: "text", text }` so existing callers keep working.
 */
export type AiProviderResponse = { text: string } | AiProviderTurn;

export type AiProviderHistoryItem =
  | { role: "assistant"; turn: Extract<AiProviderTurn, { type: "tool_call" }> }
  | { role: "tool"; id: string; name: string; result: unknown };

export interface AiProviderRequest {
  systemPrompt: string;
  promptVersion: string;
  context: AiContext;
  tools?: AiToolDescriptor[];
  history?: AiProviderHistoryItem[];
}

/**
 * Server-owned analysis request. promptVersion and schemaVersion are constants,
 * never model-authored.
 */
export interface AiAnalysisRequest {
  systemPrompt: string;
  promptVersion: string;
  schemaVersion: string;
  context: AiContext;
  draftReply: string;
}

/**
 * Structured pipeline result.
 *
 * `failed` is not returned as a body — provider/validation failures throw
 * safe AppError subclasses (HTTP 502) so the API layer never leaks internals.
 */
export type AiSkippedReason = Exclude<AiSkipReason, "requires_human">;

export type AiExecutionResult =
  | {
      outcome: "responded";
      messageId: string;
      activityId: string;
    }
  | {
      outcome: "skipped";
      reason: AiSkippedReason;
    }
  | {
      outcome: "escalated";
      reason: "requires_human";
    };
