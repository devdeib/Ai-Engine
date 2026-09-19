"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ConversationWithLead, Lead } from "@/lib/db/types";
import { leadDisplayName } from "@/modules/conversations/lib/conversation-labels";

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
  "text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

export interface CreateConversationFormProps {
  organizationId: string;
  /** When set, the lead is preselected and the picker is hidden. */
  leadId?: string;
  onSuccess: (conversation: ConversationWithLead) => void;
  onCancel: () => void;
}

export function CreateConversationForm({
  organizationId,
  leadId,
  onSuccess,
  onCancel,
}: CreateConversationFormProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState(leadId ?? "");
  const [isLoadingLeads, setIsLoadingLeads] = useState(!leadId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leadId) return;
    let cancelled = false;
    async function loadLeads() {
      setIsLoadingLeads(true);
      try {
        const res = await fetch(
          `/api/v1/organizations/${organizationId}/leads?page=1&limit=100&sortBy=first_name&sortOrder=asc`,
          { credentials: "same-origin" }
        );
        if (!res.ok) throw new Error("Failed to load leads");
        const json = (await res.json()) as { data: Lead[] };
        if (!cancelled) setLeads(json.data);
      } catch {
        if (!cancelled) setError("Unable to load leads. Please try again.");
      } finally {
        if (!cancelled) setIsLoadingLeads(false);
      }
    }
    void loadLeads();
    return () => {
      cancelled = true;
    };
  }, [organizationId, leadId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;

    const resolvedLeadId = leadId ?? selectedLeadId;
    if (!resolvedLeadId) {
      setError("Select a lead to start a conversation.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: resolvedLeadId, channel: "in_app" }),
        }
      );

      if (res.status === 409) {
        const existing = await fetch(
          `/api/v1/organizations/${organizationId}/conversations?lead_id=${resolvedLeadId}&status=open&limit=1`,
          { credentials: "same-origin" }
        );
        if (existing.ok) {
          const json = (await existing.json()) as { data: ConversationWithLead[] };
          const openConversation = json.data[0];
          if (openConversation) {
            onSuccess(openConversation);
            return;
          }
        }
        setError("An open conversation already exists for this lead.");
        return;
      }

      if (res.status === 404) {
        setError("That lead could not be found.");
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to create conversation");
      }

      const json = (await res.json()) as { data: ConversationWithLead };
      onSuccess(json.data);
    } catch {
      setError("Unable to start the conversation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">Start Conversation</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground hover:text-zeus-blue"
          aria-label="Close"
          disabled={isSubmitting}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-4 space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          {leadId ? (
            <p className="text-sm text-muted-foreground">
              An in-app conversation will be created for this lead.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="conversation-lead">
                Lead <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <select
                id="conversation-lead"
                value={selectedLeadId}
                onChange={(e) => setSelectedLeadId(e.target.value)}
                disabled={isSubmitting || isLoadingLeads}
                className={selectClass}
                aria-required="true"
              >
                <option value="">
                  {isLoadingLeads ? "Loading leads…" : "Select a lead"}
                </option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {leadDisplayName({
                      id: lead.id,
                      first_name: lead.first_name,
                      last_name: lead.last_name,
                      company_name: lead.company_name,
                    })}
                    {lead.company_name ? ` · ${lead.company_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/30">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isLoadingLeads}>
            {isSubmitting ? "Starting…" : "Start Conversation"}
          </Button>
        </div>
      </form>
    </div>
  );
}
