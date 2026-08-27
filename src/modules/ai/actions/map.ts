import type {
  AiToolAction,
  AiToolActionStatus,
  AiToolActionWithLead,
  ConversationLeadSummary,
} from "@/lib/db/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";

export function isAiToolActionExpired(
  action: Pick<AiToolAction, "status" | "expires_at">,
  now: Date = new Date()
): boolean {
  if (action.status !== "pending") return false;
  if (!action.expires_at) return false;
  return new Date(action.expires_at).getTime() <= now.getTime();
}

export function effectiveAiToolActionStatus(
  action: Pick<AiToolAction, "status" | "expires_at">,
  now: Date = new Date()
): AiToolActionStatus {
  if (isAiToolActionExpired(action, now)) return "expired";
  return action.status;
}

function publicSummary(action: AiToolAction): AiToolActionPublic["summary"] {
  if (action.result_summary && typeof action.result_summary === "object") {
    const summary = action.result_summary;
    return {
      title: typeof summary.title === "string" ? summary.title : undefined,
      dueAt: typeof summary.dueAt === "string" ? summary.dueAt : undefined,
      startsAt: typeof summary.startsAt === "string" ? summary.startsAt : undefined,
      endsAt:
        summary.endsAt === null || typeof summary.endsAt === "string"
          ? summary.endsAt
          : undefined,
      location:
        summary.location === null || typeof summary.location === "string"
          ? summary.location
          : undefined,
      status: typeof summary.status === "string" ? summary.status : undefined,
    };
  }

  const payload = action.payload;
  return {
    title: typeof payload.title === "string" ? payload.title : undefined,
    dueAt: typeof payload.dueAt === "string" ? payload.dueAt : undefined,
    startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
    endsAt:
      payload.endsAt === null || typeof payload.endsAt === "string"
        ? payload.endsAt
        : undefined,
    location:
      payload.location === null || typeof payload.location === "string"
        ? payload.location
        : undefined,
  };
}

export function toPublicAiToolAction(
  action: AiToolActionWithLead,
  now: Date = new Date()
): AiToolActionPublic {
  const lead = action.lead;
  return {
    id: action.id,
    toolName: action.tool_name,
    trust: action.trust,
    status: effectiveAiToolActionStatus(action, now),
    conversationId: action.conversation_id,
    createdAt: action.created_at,
    expiresAt: action.expires_at,
    lead: lead
      ? {
          firstName: lead.first_name,
          lastName: lead.last_name,
          companyName: lead.company_name,
        }
      : null,
    summary: publicSummary(action),
  };
}

export function toAiToolActionWithLead(row: unknown): AiToolActionWithLead {
  const raw = row as AiToolAction & { lead?: unknown };
  const embedded = Array.isArray(raw.lead) ? raw.lead[0] : raw.lead;
  let lead: ConversationLeadSummary | null = null;
  if (
    embedded &&
    typeof embedded === "object" &&
    "id" in embedded &&
    "first_name" in embedded &&
    "last_name" in embedded
  ) {
    const candidate = embedded as ConversationLeadSummary;
    lead = {
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      company_name: candidate.company_name ?? null,
    };
  }
  return { ...(raw as AiToolAction), lead };
}
