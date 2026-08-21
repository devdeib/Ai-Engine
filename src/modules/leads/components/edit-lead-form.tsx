"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "@/modules/leads/lib/lead-labels";
import type { Lead, LeadSource, LeadStatus } from "@/lib/db/types";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditFormFields {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_name: string;
  source: LeadSource;
  status: LeadStatus;
  score: string;
  notes: string;
  owner_id: string; // empty string = unassigned (will send null)
}

export interface EditLeadFormProps {
  lead: Lead;
  organizationId: string;
  onSuccess: () => void;
  onCancel: () => void;
  members?: OrgMemberOption[];
}

// ---------------------------------------------------------------------------
// Shared style constants (mirrors create-lead-form.tsx for visual consistency)
// ---------------------------------------------------------------------------

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
  "text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

const textareaClass = cn(
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2",
  "text-sm shadow-sm transition-colors placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50 resize-none"
);

// ---------------------------------------------------------------------------
// FieldError helper
// ---------------------------------------------------------------------------

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p className="text-xs text-destructive" role="alert">
      {errors[0]}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Convert Lead → form state (nulls become empty strings)
// ---------------------------------------------------------------------------

function leadToFields(lead: Lead): EditFormFields {
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    company_name: lead.company_name ?? "",
    source: lead.source,
    status: lead.status,
    score: lead.score !== null ? String(lead.score) : "",
    notes: lead.notes ?? "",
    owner_id: lead.owner_id ?? "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditLeadForm({
  lead,
  organizationId,
  onSuccess,
  onCancel,
  members = [],
}: EditLeadFormProps) {
  const [fields, setFields] = useState<EditFormFields>(() =>
    leadToFields(lead)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function setField<K extends keyof EditFormFields>(key: K, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: [] }));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    setServerError(null);
    setFieldErrors({});

    const clientErrors: Record<string, string[]> = {};
    if (!fields.first_name.trim()) {
      clientErrors.first_name = ["First name is required"];
    }
    if (!fields.last_name.trim()) {
      clientErrors.last_name = ["Last name is required"];
    }
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // For updates, cleared optional fields are sent as null so the server
      // can remove previously stored values.
      // organization_id is never sent — it is immutable and server-verified.
      // owner_id is ALWAYS included: null explicitly clears the assignment.
      const payload: Record<string, unknown> = {
        first_name: fields.first_name.trim(),
        last_name: fields.last_name.trim(),
        source: fields.source,
        status: fields.status,
        email: fields.email.trim()
          ? fields.email.trim().toLowerCase()
          : null,
        phone: fields.phone.trim() || null,
        company_name: fields.company_name.trim() || null,
        score:
          fields.score !== ""
            ? parseInt(fields.score, 10)
            : null,
        notes: fields.notes.trim() || null,
        owner_id: fields.owner_id || null,
      };

      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${lead.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        onSuccess();
        return;
      }

      const body = await res
        .json()
        .catch(() => ({ error: { message: "Unknown error" } }));

      if (res.status === 422 && body?.error?.details) {
        setFieldErrors(body.error.details as Record<string, string[]>);
      } else {
        setServerError(
          body?.error?.message ?? "Failed to update lead. Please try again."
        );
      }
    } catch {
      setServerError(
        "Network error. Please check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="space-y-4">
        <h3 className="text-base font-semibold">Edit Lead</h3>

        {/* Server error */}
        {serverError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverError}
          </div>
        )}

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-first-name">
              First name{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="edit-first-name"
              name="first_name"
              value={fields.first_name}
              onChange={(e) => setField("first_name", e.target.value)}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!fieldErrors.first_name?.length}
            />
            <FieldError errors={fieldErrors.first_name} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-last-name">
              Last name{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="edit-last-name"
              name="last_name"
              value={fields.last_name}
              onChange={(e) => setField("last_name", e.target.value)}
              disabled={isSubmitting}
              aria-required="true"
              aria-invalid={!!fieldErrors.last_name?.length}
            />
            <FieldError errors={fieldErrors.last_name} />
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            name="email"
            type="email"
            value={fields.email}
            onChange={(e) => setField("email", e.target.value)}
            disabled={isSubmitting}
            aria-invalid={!!fieldErrors.email?.length}
          />
          <FieldError errors={fieldErrors.email} />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-phone">Phone</Label>
          <Input
            id="edit-phone"
            name="phone"
            type="tel"
            value={fields.phone}
            onChange={(e) => setField("phone", e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {/* Company */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-company">Company name</Label>
          <Input
            id="edit-company"
            name="company_name"
            value={fields.company_name}
            onChange={(e) => setField("company_name", e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        {/* Source + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-source">Source</Label>
            <select
              id="edit-source"
              name="source"
              value={fields.source}
              onChange={(e) => setField("source", e.target.value)}
              disabled={isSubmitting}
              className={selectClass}
            >
              {LEAD_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              name="status"
              value={fields.status}
              onChange={(e) => setField("status", e.target.value)}
              disabled={isSubmitting}
              className={selectClass}
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Score */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-score">Score (0–100)</Label>
          <Input
            id="edit-score"
            name="score"
            type="number"
            min={0}
            max={100}
            value={fields.score}
            onChange={(e) => setField("score", e.target.value)}
            placeholder="Leave blank to remove score"
            disabled={isSubmitting}
            aria-invalid={!!fieldErrors.score?.length}
          />
          <FieldError errors={fieldErrors.score} />
        </div>

        {/* Owner */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-owner">Owner</Label>
          <select
            id="edit-owner"
            name="owner_id"
            value={fields.owner_id}
            onChange={(e) => setField("owner_id", e.target.value)}
            disabled={isSubmitting}
            className={selectClass}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label htmlFor="edit-notes">Notes</Label>
          <textarea
            id="edit-notes"
            name="notes"
            value={fields.notes}
            onChange={(e) => setField("notes", e.target.value)}
            disabled={isSubmitting}
            className={textareaClass}
            rows={3}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
