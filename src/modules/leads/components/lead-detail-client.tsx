"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Pencil,
  Trash2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import type { Lead } from "@/lib/db/types";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES,
} from "@/modules/leads/lib/lead-labels";
import { EditLeadForm } from "@/modules/leads/components/edit-lead-form";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import { ActivityTimeline } from "@/modules/leads/activities/components/activity-timeline";
import { LeadConversationCard } from "@/modules/conversations/components/lead-conversation-card";
import { FollowUpList } from "@/modules/follow-ups/components/follow-up-list";
import { AppointmentList } from "@/modules/appointments/components/appointment-list";
import { PendingAiActionsPanel } from "@/modules/ai/components/pending-ai-actions-panel";
import { AiOperatorInsightPanel } from "@/modules/ai/components/ai-operator-insight-panel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "view" | "edit" | "confirm-delete";

export interface LeadDetailClientProps {
  organizationId: string;
  leadId: string;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LeadDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-24 rounded-md bg-muted" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-md bg-muted" />
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-5 w-20 rounded-md bg-muted" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-md bg-muted" />
          <div className="h-8 w-16 rounded-md bg-muted" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border p-6 space-y-3">
            <div className="h-4 w-20 rounded-md bg-muted" />
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex gap-3">
                <div className="h-4 w-16 rounded-md bg-muted shrink-0" />
                <div className="h-4 w-32 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail field helper
// ---------------------------------------------------------------------------

function DetailField({
  label,
  value,
  nullPlaceholder = "—",
}: {
  label: string;
  value: string | null | undefined;
  nullPlaceholder?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className={value ? "" : "text-muted-foreground/50"}>
        {value ?? nullPlaceholder}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LeadDetailClient({
  organizationId,
  leadId,
}: LeadDetailClientProps) {
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<"not-found" | "error" | null>(
    null
  );
  const [mode, setMode] = useState<ViewMode>("view");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [hitlRefreshKey, setHitlRefreshKey] = useState(0);

  const fetchLead = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}`,
        { credentials: "same-origin" }
      );
      if (res.status === 404) {
        setFetchError("not-found");
        return;
      }
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }));
        throw new Error(body?.error?.message ?? "Failed to load lead");
      }
      const json = (await res.json()) as { data: Lead };
      setLead(json.data);
    } catch {
      setFetchError("error");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, leadId]);

  useEffect(() => {
    void fetchLead();
  }, [fetchLead]);

  // Fetch members for owner display + edit form selector.
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/members`,
        { credentials: "same-origin" }
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        data: Array<{ user_id: string; profile: { display_name: string } }>;
      };
      setMembers(
        json.data.map((m) => ({
          user_id: m.user_id,
          display_name: m.profile.display_name,
        }))
      );
    } catch {
      // Non-fatal: owner display will fall back to "—" if members cannot be loaded.
    }
  }, [organizationId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const handleUpdated = useCallback(() => {
    setMode("view");
    void fetchLead();
  }, [fetchLead]);

  const handleDeleteConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (res.ok || res.status === 204) {
        router.push("/dashboard/leads");
        return;
      }
      const body = await res
        .json()
        .catch(() => ({ error: { message: "Unknown error" } }));
      setDeleteError(body?.error?.message ?? "Failed to delete lead.");
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return <LeadDetailSkeleton />;
  }

  // ── Not found ─────────────────────────────────────────────────────────────

  if (fetchError === "not-found") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
          <AlertCircle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Lead not found</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          This lead may have been deleted or you do not have access to it.
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/dashboard/leads">Back to Leads</Link>
        </Button>
      </div>
    );
  }

  // ── Generic error ─────────────────────────────────────────────────────────

  if (fetchError === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-muted">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <p className="font-medium">Failed to load lead</p>
        <p className="mt-1 text-sm text-muted-foreground">
          An error occurred while loading this lead.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void fetchLead()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (!lead) return null;

  const fullName = `${lead.first_name} ${lead.last_name}`;
  const ownerName = lead.owner_id
    ? (members.find((m) => m.user_id === lead.owner_id)?.display_name ?? "—")
    : null;

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div>
        <Link
          href="/dashboard/leads"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Leads
        </Link>
      </div>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                LEAD_STATUS_CLASSES[lead.status]
              )}
            >
              {LEAD_STATUS_LABELS[lead.status]}
            </span>
            <span className="text-sm text-muted-foreground">
              {LEAD_SOURCE_LABELS[lead.source]}
            </span>
            {lead.score !== null && (
              <span className="text-sm text-muted-foreground">
                Score: {lead.score}
              </span>
            )}
          </div>
        </div>

        {mode === "view" && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMode("edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => {
                setDeleteError(null);
                setMode("confirm-delete");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Delete confirmation banner */}
      {mode === "confirm-delete" && (
        <div
          role="alertdialog"
          aria-label="Delete lead confirmation"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="font-medium text-sm">Delete this lead?</p>
          <p className="text-sm text-muted-foreground mt-1">
            <strong>{fullName}</strong> will be permanently removed. This action
            cannot be undone.
          </p>
          {deleteError && (
            <p className="text-sm text-destructive mt-2" role="alert">
              {deleteError}
            </p>
          )}
          <div className="flex items-center gap-2 mt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDeleteConfirm()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete Lead"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMode("view");
                setDeleteError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Edit form (replaces the detail cards while editing) */}
      {mode === "edit" ? (
        <Card>
          <CardContent className="pt-6">
            <EditLeadForm
              lead={lead}
              organizationId={organizationId}
              onSuccess={handleUpdated}
              onCancel={() => setMode("view")}
              members={members}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Contact + Lead details cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <DetailField label="Email" value={lead.email} />
                <DetailField label="Phone" value={lead.phone} />
                <DetailField label="Company" value={lead.company_name} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Lead Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <DetailField
                  label="Source"
                  value={LEAD_SOURCE_LABELS[lead.source]}
                />
                <DetailField
                  label="Status"
                  value={LEAD_STATUS_LABELS[lead.status]}
                />
                <DetailField
                  label="Score"
                  value={lead.score !== null ? String(lead.score) : null}
                  nullPlaceholder="Not scored"
                />
                <DetailField
                  label="Owner"
                  value={ownerName}
                  nullPlaceholder="Unassigned"
                />
                <DetailField label="Created" value={formatDate(lead.created_at)} />
                <DetailField label="Updated" value={formatDate(lead.updated_at)} />
              </CardContent>
            </Card>
          </div>

          {/* Notes card — only shown when notes are present */}
          {lead.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              </CardContent>
            </Card>
          )}

          <LeadConversationCard
            organizationId={organizationId}
            leadId={leadId}
          />

          <AiOperatorInsightPanel
            organizationId={organizationId}
            leadId={leadId}
            onAppointmentRequested={() => setHitlRefreshKey((key) => key + 1)}
          />

          <PendingAiActionsPanel
            organizationId={organizationId}
            leadId={leadId}
            refreshKey={hitlRefreshKey}
          />

          <FollowUpList
            organizationId={organizationId}
            leadId={leadId}
            members={members}
          />

          <AppointmentList
            organizationId={organizationId}
            leadId={leadId}
            members={members}
          />

          {/* Activity timeline */}
          <ActivityTimeline organizationId={organizationId} leadId={leadId} />
        </>
      )}
    </div>
  );
}
