"use client";

import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/lib/db/types";
import {
  APPOINTMENT_STATUS_CLASSES,
  APPOINTMENT_STATUS_LABELS,
} from "@/modules/appointments/lib/appointment-labels";

export interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  overdue?: boolean;
}

export function AppointmentStatusBadge({
  status,
  overdue = false,
}: AppointmentStatusBadgeProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
          APPOINTMENT_STATUS_CLASSES[status]
        )}
      >
        {APPOINTMENT_STATUS_LABELS[status]}
      </span>
      {overdue && status === "scheduled" && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-destructive/10 text-red-700">
          Overdue
        </span>
      )}
    </span>
  );
}
