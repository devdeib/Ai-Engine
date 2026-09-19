"use client";

/**
 * Follow-ups section for a single lead.
 * Owns its own fetch so LeadDetailClient stays decoupled from the follow-up API.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LeadFollowUp } from "@/lib/db/types";
import type { OrgMemberOption } from "@/modules/leads/components/lead-table";
import { CreateFollowUpForm } from "@/modules/follow-ups/components/create-follow-up-form";
import { FollowUpItem } from "@/modules/follow-ups/components/follow-up-item";

export interface FollowUpListProps {
  organizationId: string;
  leadId: string;
  members?: OrgMemberOption[];
}

function FollowUpSkeleton() {
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

export function FollowUpList({
  organizationId,
  leadId,
  members = [],
}: FollowUpListProps) {
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/follow-ups?page=1&limit=20`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to load follow-ups");
      }
      const json = (await res.json()) as { data: LeadFollowUp[] };
      setFollowUps(json.data);
    } catch {
      setFetchError("Failed to load follow-ups.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, leadId]);

  useEffect(() => {
    void fetchFollowUps();
  }, [fetchFollowUps]);

  const assigneeName = (assignedUserId: string | null) => {
    if (!assignedUserId) return null;
    return (
      members.find((member) => member.user_id === assignedUserId)
        ?.display_name ?? "—"
    );
  };

  const handleCreate = async (values: {
    title: string;
    notes: string | null;
    due_at: string;
    assigned_user_id: string | null;
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/follow-ups`,
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
        throw new Error(body?.error?.message ?? "Failed to create follow-up");
      }
      await fetchFollowUps();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create follow-up."
      );
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const patchStatus = async (
    followUpId: string,
    status: "completed" | "cancelled"
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CreateFollowUpForm
          members={members}
          isSubmitting={isSubmitting}
          error={submitError}
          onSubmit={handleCreate}
        />

        <div className="border-t" aria-hidden="true" />

        {isLoading ? (
          <FollowUpSkeleton />
        ) : fetchError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchFollowUps()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : followUps.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No follow-ups yet.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Follow-ups">
            {followUps.map((followUp) => (
              <li key={followUp.id}>
                <FollowUpItem
                  followUp={followUp}
                  assigneeName={assigneeName(followUp.assigned_user_id)}
                  isUpdating={updatingId === followUp.id}
                  error={updatingId === followUp.id ? updateError : null}
                  onComplete={(id) => void patchStatus(id, "completed")}
                  onCancel={(id) => void patchStatus(id, "cancelled")}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
