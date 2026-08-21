/**
 * Display labels for conversation enums.
 * Pure utilities — no React, no side effects.
 */
import type {
  ConversationChannel,
  ConversationLeadSummary,
  ConversationStatus,
} from "@/lib/db/types";

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  open: "Open",
  closed: "Closed",
};

export const CONVERSATION_STATUS_CLASSES: Record<ConversationStatus, string> = {
  open: "bg-green-50 text-green-700 ring-green-600/20",
  closed: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const CONVERSATION_CHANNEL_LABELS: Record<ConversationChannel, string> = {
  in_app: "In App",
};

export function leadDisplayName(
  lead: ConversationLeadSummary | null | undefined
): string {
  if (!lead) return "Unknown lead";
  const name = `${lead.first_name} ${lead.last_name}`.trim();
  return name || "Unknown lead";
}
