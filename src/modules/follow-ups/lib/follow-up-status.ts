/**
 * Display helpers for follow-up status. Pure — no React, no side effects.
 *
 * Overdue is derived: pending AND due_at < now. It is never a stored status.
 */
import type { LeadFollowUp, LeadFollowUpStatus } from "@/lib/db/types";

export const FOLLOW_UP_STATUS_LABELS: Record<LeadFollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const FOLLOW_UP_STATUS_CLASSES: Record<LeadFollowUpStatus, string> = {
  pending: "bg-blue-50 text-blue-700 ring-blue-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export function isFollowUpOverdue(
  followUp: Pick<LeadFollowUp, "status" | "due_at">,
  now: Date = new Date()
): boolean {
  if (followUp.status !== "pending") return false;
  return new Date(followUp.due_at).getTime() < now.getTime();
}

export type FollowUpQueueBucket =
  | "overdue"
  | "due_today"
  | "upcoming"
  | "done";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Display bucket for the org-wide follow-up queue.
 * Overdue wins over "due today" when a pending item's due_at is in the past.
 */
export function followUpQueueBucket(
  followUp: Pick<LeadFollowUp, "status" | "due_at">,
  now: Date = new Date()
): FollowUpQueueBucket {
  if (followUp.status !== "pending") return "done";
  const due = new Date(followUp.due_at);
  if (due.getTime() < now.getTime()) return "overdue";
  if (isSameLocalDay(due, now)) return "due_today";
  return "upcoming";
}
