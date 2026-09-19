"use client";

/**
 * Appointments section for a single lead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Appointment } from "@/lib/db/types";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import { appointmentQueueBucket } from "@/modules/appointments/lib/appointment-labels";
import {
  AppointmentForm,
  type AppointmentFormValues,
} from "@/modules/appointments/components/appointment-form";
import { AppointmentItem } from "@/modules/appointments/components/appointment-item";
import { isDemoVideoDataEnabled } from "@/modules/dashboard/demo-mode";
import { listDemoAppointments } from "@/modules/dashboard/demo-catalog";

export interface AppointmentListProps {
  organizationId: string;
  leadId: string;
  members?: OrgMemberOption[];
}

function AppointmentSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-md border p-3 space-y-2">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="h-3 w-28 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function AppointmentList({
  organizationId,
  leadId,
  members = [],
}: AppointmentListProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    if (isDemoVideoDataEnabled()) {
      setAppointments(listDemoAppointments({ leadId }));
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/appointments?page=1&limit=20`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to load appointments");
      }
      const json = (await res.json()) as { data: Appointment[] };
      setAppointments(json.data);
    } catch {
      setFetchError("Failed to load appointments.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, leadId]);

  useEffect(() => {
    void fetchAppointments();
  }, [fetchAppointments]);

  const assigneeName = (assignedUserId: string | null) => {
    if (!assignedUserId) return null;
    return (
      members.find((member) => member.user_id === assignedUserId)
        ?.display_name ?? "—"
    );
  };

  const handleCreate = async (values: AppointmentFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/appointments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(values),
        }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to schedule appointment");
      }
      await fetchAppointments();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to schedule appointment."
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const patchAppointment = async (
    appointmentId: string,
    body: AppointmentFormValues | { status: "completed" | "cancelled" }
  ) => {
    setUpdatingId(appointmentId);
    setUpdateError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/appointments/${appointmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const payload = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(payload?.error?.message ?? "Failed to update appointment");
      }
      setEditingId(null);
      await fetchAppointments();
    } catch (err) {
      setUpdateError(
        err instanceof Error ? err.message : "Failed to update appointment."
      );
      throw err;
    } finally {
      setUpdatingId(null);
    }
  };

  const grouped = useMemo(() => {
    const scheduled: Appointment[] = [];
    const done: Appointment[] = [];
    const now = new Date();
    for (const appointment of appointments) {
      if (appointmentQueueBucket(appointment, now) === "done") {
        done.push(appointment);
      } else {
        scheduled.push(appointment);
      }
    }
    return { scheduled, done };
  }, [appointments]);

  const editing = appointments.find((item) => item.id === editingId) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Appointments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <AppointmentForm
            key={editing.id}
            members={members}
            isSubmitting={updatingId === editing.id}
            error={updatingId === editing.id ? updateError : null}
            submitLabel="Save changes"
            initialValues={{
              starts_at: editing.starts_at,
              ends_at: editing.ends_at,
              location: editing.location,
              notes: editing.notes,
              assigned_user_id: editing.assigned_user_id,
            }}
            onCancel={() => {
              setEditingId(null);
              setUpdateError(null);
            }}
            onSubmit={(values) => patchAppointment(editing.id, values)}
          />
        ) : (
          <AppointmentForm
            members={members}
            isSubmitting={isSubmitting}
            error={submitError}
            onSubmit={handleCreate}
          />
        )}

        <div className="border-t" aria-hidden="true" />

        {isLoading ? (
          <AppointmentSkeleton />
        ) : fetchError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchAppointments()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : appointments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No appointments yet.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.scheduled.length > 0 && (
              <ul className="space-y-3" aria-label="Scheduled appointments">
                {grouped.scheduled.map((appointment) => (
                  <li key={appointment.id}>
                    <AppointmentItem
                      appointment={appointment}
                      assigneeName={assigneeName(appointment.assigned_user_id)}
                      isUpdating={updatingId === appointment.id}
                      error={updatingId === appointment.id ? updateError : null}
                      onComplete={(id) =>
                        void patchAppointment(id, { status: "completed" }).catch(
                          () => undefined
                        )
                      }
                      onCancel={(id) =>
                        void patchAppointment(id, { status: "cancelled" }).catch(
                          () => undefined
                        )
                      }
                      onEdit={setEditingId}
                    />
                  </li>
                ))}
              </ul>
            )}
            {grouped.done.length > 0 && (
              <ul className="space-y-3" aria-label="Past appointments">
                {grouped.done.map((appointment) => (
                  <li key={appointment.id}>
                    <AppointmentItem
                      appointment={appointment}
                      assigneeName={assigneeName(appointment.assigned_user_id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
