"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LEAD_SOURCE_OPTIONS,
  LEAD_STATUS_OPTIONS,
} from "@/modules/leads/lib/lead-labels";
import type { LeadSource, LeadStatus } from "@/lib/db/types";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormFields {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_name: string;
  source: LeadSource;
  status: LeadStatus;
  score: string;
  notes: string;
  owner_id: string; // empty string = unassigned
}

const INITIAL_FIELDS: FormFields = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  company_name: "",
  source: "other",
  status: "new",
  score: "",
  notes: "",
  owner_id: "",
};

export interface CreateLeadFormProps {
  organizationId: string;
  onSuccess: () => void;
  onCancel: () => void;
  members?: OrgMemberOption[];
}

// ---------------------------------------------------------------------------
// Shared select class — same visual style as Input
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
// Component
// ---------------------------------------------------------------------------

export function CreateLeadForm({
  organizationId,
  onSuccess,
  onCancel,
  members = [],
}: CreateLeadFormProps) {
  const [fields, setFields] = useState<FormFields>(INITIAL_FIELDS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function setField<K extends keyof FormFields>(key: K, value: string) {
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

    // Lightweight client-side guard for required fields
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
      // Build payload — never include organization_id; the API derives it
      // from the authenticated session via the URL path parameter.
      const payload: Record<string, unknown> = {
        first_name: fields.first_name.trim(),
        last_name: fields.last_name.trim(),
        source: fields.source,
        status: fields.status,
      };

      if (fields.email.trim()) payload.email = fields.email.trim().toLowerCase();
      if (fields.phone.trim()) payload.phone = fields.phone.trim();
      if (fields.company_name.trim())
        payload.company_name = fields.company_name.trim();
      if (fields.score !== "") {
        const n = parseInt(fields.score, 10);
        if (!isNaN(n)) payload.score = n;
      }
      if (fields.notes.trim()) payload.notes = fields.notes.trim();
      // Include owner_id only when a member is selected; omit means unassigned.
      if (fields.owner_id) payload.owner_id = fields.owner_id;

      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads`,
        {
          method: "POST",
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
          body?.error?.message ?? "Failed to create lead. Please try again."
        );
      }
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2 className="text-base font-semibold">New Lead</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close form"
          disabled={isSubmitting}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[65vh]">
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
              <Label htmlFor="lead-first-name">
                First name <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="lead-first-name"
                name="first_name"
                value={fields.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
                placeholder="Ahmed"
                disabled={isSubmitting}
                aria-required="true"
                aria-describedby={
                  fieldErrors.first_name?.length
                    ? "first-name-error"
                    : undefined
                }
                aria-invalid={!!fieldErrors.first_name?.length}
              />
              <FieldError errors={fieldErrors.first_name} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-last-name">
                Last name <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Input
                id="lead-last-name"
                name="last_name"
                value={fields.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
                placeholder="Ali"
                disabled={isSubmitting}
                aria-required="true"
                aria-describedby={
                  fieldErrors.last_name?.length ? "last-name-error" : undefined
                }
                aria-invalid={!!fieldErrors.last_name?.length}
              />
              <FieldError errors={fieldErrors.last_name} />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              name="email"
              type="email"
              value={fields.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="ahmed@example.com"
              disabled={isSubmitting}
              aria-describedby={
                fieldErrors.email?.length ? "email-error" : undefined
              }
              aria-invalid={!!fieldErrors.email?.length}
            />
            <FieldError errors={fieldErrors.email} />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-phone">Phone</Label>
            <Input
              id="lead-phone"
              name="phone"
              type="tel"
              value={fields.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="+974 55 123 456"
              disabled={isSubmitting}
            />
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-company">Company name</Label>
            <Input
              id="lead-company"
              name="company_name"
              value={fields.company_name}
              onChange={(e) => setField("company_name", e.target.value)}
              placeholder="Acme Corp"
              disabled={isSubmitting}
            />
          </div>

          {/* Source + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-source">Source</Label>
              <select
                id="lead-source"
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
              <Label htmlFor="lead-status">Status</Label>
              <select
                id="lead-status"
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
            <Label htmlFor="lead-score">Score (0–100)</Label>
            <Input
              id="lead-score"
              name="score"
              type="number"
              min={0}
              max={100}
              value={fields.score}
              onChange={(e) => setField("score", e.target.value)}
              placeholder="Leave blank if not scored"
              disabled={isSubmitting}
              aria-describedby={
                fieldErrors.score?.length ? "score-error" : undefined
              }
              aria-invalid={!!fieldErrors.score?.length}
            />
            <FieldError errors={fieldErrors.score} />
          </div>

          {/* Owner */}
          <div className="space-y-1.5">
            <Label htmlFor="lead-owner">Owner</Label>
            <select
              id="lead-owner"
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
            <Label htmlFor="lead-notes">Notes</Label>
            <textarea
              id="lead-notes"
              name="notes"
              value={fields.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Any additional context about this lead…"
              disabled={isSubmitting}
              className={textareaClass}
              rows={3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating…" : "Create Lead"}
          </Button>
        </div>
      </form>
    </div>
  );
}
