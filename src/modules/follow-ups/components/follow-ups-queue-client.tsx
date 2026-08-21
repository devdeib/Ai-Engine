"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LeadFollowUpStatus, LeadFollowUpWithLead } from "@/lib/db/types";
import { leadDisplayName } from "@/modules/conversations/lib/conversation-labels";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import {
  followUpQueueBucket,
  type FollowUpQueueBucket,
} from "@/modules/follow-ups/lib/follow-up-status";
import { FollowUpItem } from "@/modules/follow-ups/components/follow-up-item";

type QueueTab = "pending" | "completed" | "cancelled" | "all";

const TABS: { id: QueueTab; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const BUCKET_LABELS: Record<Exclude<FollowUpQueueBucket, "done">, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  upcoming: "Upcoming",
};

interface QueueMeta {
  page: number;
  limit: number;
  count: number;
}

export interface FollowUpsQueueClientProps {
  organizationId: string;
}

export function FollowUpsQueueClient({
  organizationId,
}: FollowUpsQueueClientProps) {
  const [tab, setTab] = useState<QueueTab>("pending");
  const [page, setPage] = useState(1);
  const [followUps, setFollowUps] = useState<LeadFollowUpWithLead[]>([]);
  const [meta, setMeta] = useState<QueueMeta>({ page: 1, limit: 20, count: 0 });
  const [members, setMembers] = useState<OrgMemberOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
        json.data.map((member) => ({
          user_id: member.user_id,
          display_name: member.profile.display_name,
        }))
      );
    } catch {
      // Non-fatal: assignee names fall back to Unassigned / —
    }
  }, [organizationId]);

  useEffect(() => {
    void fetchMembers();
  }, [fetchMembers]);

  const fetchFollowUps = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (tab !== "all") params.set("status", tab);
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/follow-ups?${params}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Failed to load follow-ups");
      const json = (await res.json()) as {
        data: LeadFollowUpWithLead[];
        meta: QueueMeta;
      };
      setFollowUps(json.data);
      setMeta(json.meta);
    } catch {
      setFetchError("Unable to load follow-ups. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, page, tab]);

  useEffect(() => {
    void fetchFollowUps();
  }, [fetchFollowUps]);

  const grouped = useMemo(() => {
    const buckets: Record<FollowUpQueueBucket, LeadFollowUpWithLead[]> = {
      overdue: [],
      due_today: [],
      upcoming: [],
      done: [],
    };
    const now = new Date();
    for (const followUp of followUps) {
      buckets[followUpQueueBucket(followUp, now)].push(followUp);
    }
    return buckets;
  }, [followUps]);

  const assigneeName = (assignedUserId: string | null) => {
    if (!assignedUserId) return null;
    return (
      members.find((member) => member.user_id === assignedUserId)
        ?.display_name ?? "—"
    );
  };

  const patchStatus = async (
    followUpId: string,
    status: Extract<LeadFollowUpStatus, "completed" | "cancelled">
  ) => {
    setUpdatingId(followUpId);
    setUpdateError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/follow-ups/${followUpId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to update follow-up");
      }
      await fetchFollowUps();
    } catch (err) {
      setUpdateError(
        err instanceof Error ? err.message : "Failed to update follow-up."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const showBuckets = tab === "pending" || tab === "all";
  const hasPrev = page > 1;
  const hasNext = meta.count === meta.limit;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Follow-ups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Next sales actions across your pipeline.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Follow-up status">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
            onClick={() => {
              setTab(item.id);
              setPage(1);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-md border bg-muted/40" />
          ))}
        </div>
      ) : fetchError ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchFollowUps()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : followUps.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">No follow-ups</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            Create a follow-up from a lead to track the next sales action.
          </p>
        </div>
      ) : showBuckets ? (
        <div className="space-y-6">
          {(["overdue", "due_today", "upcoming"] as const).map((bucket) =>
            grouped[bucket].length === 0 ? null : (
              <section key={bucket} aria-label={BUCKET_LABELS[bucket]}>
                <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {BUCKET_LABELS[bucket]}
                </h2>
                <ul className="space-y-3">
                  {grouped[bucket].map((followUp) => (
                    <QueueItem
                      key={followUp.id}
                      followUp={followUp}
                      assigneeName={assigneeName(followUp.assigned_user_id)}
                      isUpdating={updatingId === followUp.id}
                      error={updatingId === followUp.id ? updateError : null}
                      onComplete={(id) => void patchStatus(id, "completed")}
                      onCancel={(id) => void patchStatus(id, "cancelled")}
                    />
                  ))}
                </ul>
              </section>
            )
          )}
          {tab === "all" && grouped.done.length > 0 && (
            <section aria-label="Completed and cancelled">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Completed / cancelled
              </h2>
              <ul className="space-y-3">
                {grouped.done.map((followUp) => (
                  <QueueItem
                    key={followUp.id}
                    followUp={followUp}
                    assigneeName={assigneeName(followUp.assigned_user_id)}
                    isUpdating={false}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Follow-ups">
          {followUps.map((followUp) => (
            <QueueItem
              key={followUp.id}
              followUp={followUp}
              assigneeName={assigneeName(followUp.assigned_user_id)}
              isUpdating={updatingId === followUp.id}
              error={updatingId === followUp.id ? updateError : null}
            />
          ))}
        </ul>
      )}

      {!isLoading && !fetchError && followUps.length > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function QueueItem({
  followUp,
  assigneeName,
  isUpdating,
  error,
  onComplete,
  onCancel,
}: {
  followUp: LeadFollowUpWithLead;
  assigneeName: string | null;
  isUpdating: boolean;
  error?: string | null;
  onComplete?: (id: string) => void;
  onCancel?: (id: string) => void;
}) {
  return (
    <li className="space-y-1">
      <FollowUpItem
        followUp={followUp}
        assigneeName={assigneeName}
        isUpdating={isUpdating}
        error={error}
        onComplete={onComplete}
        onCancel={onCancel}
      />
      <p className="px-1 text-xs text-muted-foreground">
        Lead:{" "}
        <Link
          href={`/dashboard/leads/${followUp.lead_id}`}
          className="underline-offset-2 hover:underline"
        >
          {leadDisplayName(followUp.lead)}
        </Link>
      </p>
    </li>
  );
}
