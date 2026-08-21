"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import {
  FOLLOW_UP_NOTES_MAX,
  FOLLOW_UP_TITLE_MAX,
} from "@/modules/follow-ups/schema";

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

export interface CreateFollowUpValues {
  title: string;
  notes: string | null;
  due_at: string;
  assigned_user_id: string | null;
}

export interface CreateFollowUpFormProps {
  members: OrgMemberOption[];
  isSubmitting?: boolean;
  error?: string | null;
  onSubmit: (values: CreateFollowUpValues) => Promise<void> | void;
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function CreateFollowUpForm({
  members,
  isSubmitting = false,
  error = null,
  onSubmit,
}: CreateFollowUpFormProps) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setLocalError("Title is required.");
      return;
    }
    const isoDue = datetimeLocalToIso(dueAt);
    if (!isoDue) {
      setLocalError("Due date is required.");
      return;
    }
    setLocalError(null);
    try {
      await onSubmit({
        title: trimmedTitle,
        notes: notes.trim() ? notes.trim() : null,
        due_at: isoDue,
        assigned_user_id: assignedUserId ? assignedUserId : null,
      });
      setTitle("");
      setDueAt("");
      setAssignedUserId("");
      setNotes("");
    } catch {
      // Parent surfaces the error; keep the form values.
    }
  };

  const displayError = localError ?? error;

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="space-y-3"
      aria-label="Create follow-up"
    >
      <div className="space-y-1.5">
        <Label htmlFor="follow-up-title">Title</Label>
        <Input
          id="follow-up-title"
          name="title"
          value={title}
          maxLength={FOLLOW_UP_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Call Ahmed about the property"
          disabled={isSubmitting}
          aria-label="Title"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="follow-up-due">Due date</Label>
          <Input
            id="follow-up-due"
            name="due_at"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={isSubmitting}
            aria-label="Due date"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="follow-up-assignee">Assigned to</Label>
          <select
            id="follow-up-assignee"
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
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="follow-up-notes">Notes</Label>
        <textarea
          id="follow-up-notes"
          name="notes"
          className={textareaClass}
          value={notes}
          maxLength={FOLLOW_UP_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional context for this follow-up"
          disabled={isSubmitting}
          aria-label="Notes"
        />
      </div>

      {displayError && (
        <p className="text-sm text-destructive" role="alert">
          {displayError}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !title.trim() || !dueAt}
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Add follow-up
        </Button>
      </div>
    </form>
  );
}
