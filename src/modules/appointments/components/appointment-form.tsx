"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import {
  APPOINTMENT_LOCATION_MAX,
  APPOINTMENT_NOTES_MAX,
} from "@/modules/appointments/schema";

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
  "text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const textareaClass = cn(
  "flex min-h-[72px] w-full resize-none rounded-md border border-input",
  "bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
  "placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

export interface AppointmentFormValues {
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  notes: string | null;
  assigned_user_id: string | null;
}

export interface AppointmentFormProps {
  members: OrgMemberOption[];
  isSubmitting?: boolean;
  error?: string | null;
  submitLabel?: string;
  initialValues?: Partial<AppointmentFormValues>;
  onSubmit: (values: AppointmentFormValues) => Promise<void> | void;
  onCancel?: () => void;
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AppointmentForm({
  members,
  isSubmitting = false,
  error = null,
  submitLabel = "Schedule appointment",
  initialValues,
  onSubmit,
  onCancel,
}: AppointmentFormProps) {
  const [startsAt, setStartsAt] = useState(
    isoToDatetimeLocal(initialValues?.starts_at)
  );
  const [endsAt, setEndsAt] = useState(isoToDatetimeLocal(initialValues?.ends_at));
  const [assignedUserId, setAssignedUserId] = useState(
    initialValues?.assigned_user_id ?? ""
  );
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const isoStart = datetimeLocalToIso(startsAt);
    if (!isoStart) {
      setLocalError("Start date is required.");
      return;
    }
    const isoEnd = datetimeLocalToIso(endsAt);
    if (endsAt.trim() && !isoEnd) {
      setLocalError("End date must be a valid date and time.");
      return;
    }
    if (isoEnd && new Date(isoEnd).getTime() <= new Date(isoStart).getTime()) {
      setLocalError("End time must be after the start time.");
      return;
    }
    setLocalError(null);
    try {
      await onSubmit({
        starts_at: isoStart,
        ends_at: isoEnd,
        location: location.trim() ? location.trim() : null,
        notes: notes.trim() ? notes.trim() : null,
        assigned_user_id: assignedUserId ? assignedUserId : null,
      });
      if (!initialValues) {
        setStartsAt("");
        setEndsAt("");
        setAssignedUserId("");
        setLocation("");
        setNotes("");
      }
    } catch {
      // Parent surfaces the error; keep the form values.
    }
  };

  const displayError = localError ?? error;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3"
      aria-label={initialValues ? "Edit appointment" : "Schedule appointment"}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="appointment-start">Start</Label>
          <Input
            id="appointment-start"
            name="starts_at"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            disabled={isSubmitting}
            aria-label="Start"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointment-end">End (optional)</Label>
          <Input
            id="appointment-end"
            name="ends_at"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            disabled={isSubmitting}
            aria-label="End"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="appointment-assignee">Assigned to</Label>
          <select
            id="appointment-assignee"
            name="assigned_user_id"
            className={selectClass}
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            disabled={isSubmitting}
            aria-label="Assigned to"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="appointment-location">Location</Label>
          <Input
            id="appointment-location"
            name="location"
            value={location}
            maxLength={APPOINTMENT_LOCATION_MAX}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Property or office"
            disabled={isSubmitting}
            aria-label="Location"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appointment-notes">Notes</Label>
        <textarea
          id="appointment-notes"
          name="notes"
          className={textareaClass}
          value={notes}
          maxLength={APPOINTMENT_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context for this appointment"
          disabled={isSubmitting}
          aria-label="Notes"
        />
      </div>

      {displayError && (
        <p className="text-sm text-destructive" role="alert">
          {displayError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Close
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting || !startsAt}>
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
