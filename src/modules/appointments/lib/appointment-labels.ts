/**
 * Display helpers for appointment status. Pure — no React, no side effects.
 *
 * Overdue is derived: scheduled AND starts_at < now. It is never a stored status.
 */
import type { Appointment, AppointmentStatus } from "@/lib/db/types";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const APPOINTMENT_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700 ring-blue-600/20",
  completed: "bg-green-50 text-green-700 ring-green-600/20",
  cancelled: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

export const APPOINTMENT_QUEUE_LABELS = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  done: "Completed / cancelled",
} as const;

export function isAppointmentOverdue(
  appointment: Pick<Appointment, "status" | "starts_at">,
  now: Date = new Date()
): boolean {
  if (appointment.status !== "scheduled") return false;
  return new Date(appointment.starts_at).getTime() < now.getTime();
}

export type AppointmentQueueBucket = "overdue" | "today" | "upcoming" | "done";

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Display bucket for the org-wide appointment queue.
 * Overdue wins over "today" when a scheduled item's starts_at is in the past.
 */
export function appointmentQueueBucket(
  appointment: Pick<Appointment, "status" | "starts_at">,
  now: Date = new Date()
): AppointmentQueueBucket {
  if (appointment.status !== "scheduled") return "done";
  const start = new Date(appointment.starts_at);
  if (start.getTime() < now.getTime()) return "overdue";
  if (isSameLocalDay(start, now)) return "today";
  return "upcoming";
}
