/**
 * Display labels for conversation enums.
 * Pure utilities — no React, no side effects.
 */
import type {
  ConversationChannel,
  ConversationLeadSummary,
  ConversationStatus,
  MessageWithDeliveryStatus,
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
  test: "Test",
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
};

export function leadDisplayName(
  lead: ConversationLeadSummary | null | undefined
): string {
  if (!lead) return "Unknown lead";
  const name = `${lead.first_name} ${lead.last_name}`.trim();
  return name || "Unknown lead";
}

/**
 * Inbox attribution for a listed message.
 * In-app outbound stays Sent (or AI). External outbound uses delivery truth.
 * A missing external delivery status is Queued — never Sent.
 */
export function conversationMessageAttribution(
  message: Pick<
    MessageWithDeliveryStatus,
    "direction" | "author_type" | "delivery_status"
  >
): string {
  if (message.direction !== "outbound") {
    return "Received";
  }

  const isAi = message.author_type === "ai";

  switch (message.delivery_status) {
    case "queued":
      return isAi ? "AI · Queued" : "Queued";
    case "sent":
      return isAi ? "AI · Sent" : "Sent";
    case "failed":
      return isAi ? "AI · Failed" : "Failed";
    case "not_applicable":
      return isAi ? "AI" : "Sent";
    default:
      return isAi ? "AI · Queued" : "Queued";
  }
}
