"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import type { Appointment } from "@/lib/db/types";
import { isAppointmentOverdue } from "@/modules/appointments/lib/appointment-labels";
import { AppointmentStatusBadge } from "@/modules/appointments/components/appointment-status-badge";

export interface AppointmentItemProps {
  appointment: Appointment;
  assigneeName: string | null;
  now?: Date;
  isUpdating?: boolean;
  error?: string | null;
  onComplete?: (appointmentId: string) => void;
  onCancel?: (appointmentId: string) => void;
  onEdit?: (appointmentId: string) => void;
}

export function AppointmentItem({
  appointment,
  assigneeName,
  now,
  isUpdating = false,
  error = null,
  onComplete,
  onCancel,
  onEdit,
}: AppointmentItemProps) {
  const overdue = isAppointmentOverdue(appointment, now);
  const scheduled = appointment.status === "scheduled";
  const title = appointment.location?.trim() || "Appointment";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{title}</p>
          <p className="text-xs text-muted-foreground">
            <time dateTime={appointment.starts_at}>
              {formatDateTime(appointment.starts_at)}
            </time>
            {appointment.ends_at && (
              <>
                <span aria-hidden="true"> – </span>
                <time dateTime={appointment.ends_at}>
                  {formatDateTime(appointment.ends_at)}
                </time>
              </>
            )}
            <span aria-hidden="true"> · </span>
            {assigneeName ?? "Unassigned"}
          </p>
        </div>
        <AppointmentStatusBadge status={appointment.status} overdue={overdue} />
      </div>

      {appointment.notes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {appointment.notes}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {scheduled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isUpdating}
            onClick={() => onComplete?.(appointment.id)}
          >
            {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Complete
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUpdating}
            onClick={() => onCancel?.(appointment.id)}
          >
            Cancel
          </Button>
          {onEdit && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isUpdating}
              onClick={() => onEdit(appointment.id)}
            >
              Edit
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
