/**
 * Concise CRM timeline copy for automatically recorded events.
 * Never includes message bodies, notes, or identifiers.
 */
import { boundActivityContent } from "@/modules/leads/activities/schema";
import type { MessageDirection } from "@/lib/db/types";

export function conversationStartedContent(): string {
  return "Conversation started";
}

export function messageActivityContent(direction: MessageDirection): string {
  return direction === "outbound"
    ? "Outbound message sent"
    : "Inbound message received";
}

export function followUpActivityContent(
  event: "created" | "completed" | "cancelled",
  title: string
): string {
  const verb =
    event === "created"
      ? "created"
      : event === "completed"
        ? "completed"
        : "cancelled";
  return boundActivityContent(`Follow-up ${verb}: ${title.trim()}`);
}

export function appointmentActivityContent(
  event: "scheduled" | "completed" | "cancelled"
): string {
  if (event === "scheduled") return "Appointment scheduled";
  if (event === "completed") return "Appointment completed";
  return "Appointment cancelled";
}

export function aiResponseGeneratedContent(): string {
  return "AI response generated";
}

export function aiPausedContent(): string {
  return "AI paused";
}

export function aiResumedContent(): string {
  return "AI resumed";
}

export function aiEscalatedContent(): string {
  return "Escalated to human";
}

export function aiAppointmentApprovalRequestedContent(): string {
  return "AI requested an appointment approval.";
}

export function aiAppointmentRequestRejectedContent(): string {
  return "AI appointment request rejected.";
}

export function aiAppointmentRequestExpiredContent(): string {
  return "AI appointment request expired.";
}
