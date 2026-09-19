"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";
import { actionCenterConversationHref } from "@/modules/ai/action-center/constants";

export interface PendingAiActionsPanelProps {
  organizationId: string;
  conversationId?: string;
  leadId?: string;
  compact?: boolean;
  refreshKey?: number;
  hideWhenEmpty?: boolean;
  showConversationLink?: boolean;
  onDecision?: () => void;
}

function actionLabel(toolName: AiToolActionPublic["toolName"]): string {
  if (toolName === "create_appointment") return "Proposed appointment";
  return "Follow-up";
}

function leadName(action: AiToolActionPublic): string {
  if (!action.lead) return "Lead";
  return `${action.lead.firstName} ${action.lead.lastName}`.trim();
}

export function PendingAiActionsPanel({
  organizationId,
  conversationId,
  leadId,
  compact = false,
  refreshKey = 0,
  hideWhenEmpty = false,
  showConversationLink = false,
  onDecision,
}: PendingAiActionsPanelProps) {
  const [actions, setActions] = useState<AiToolActionPublic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "20",
        status: "pending",
      });
      if (leadId) params.set("lead_id", leadId);
      const path = conversationId
        ? `/api/v1/organizations/${organizationId}/conversations/${conversationId}/ai/actions?${params}`
        : `/api/v1/organizations/${organizationId}/ai/actions?${params}`;
      const res = await fetch(path, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load pending actions");
      const json = (await res.json()) as { data: AiToolActionPublic[] };
      setActions(json.data.filter((action) => action.status === "pending"));
    } catch {
      setError("Unable to load pending AI actions.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, conversationId, leadId]);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions, refreshKey]);

  async function decide(actionId: string, decision: "approve" | "reject") {
    if (busyId) return;
    setBusyId(actionId);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai/actions/${actionId}/${decision}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (res.status === 409) {
        throw new Error("This request was already decided or has expired.");
      }
      if (!res.ok) {
        throw new Error("Unable to update this request.");
      }
      await fetchActions();
      onDecision?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update this request.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return (
      <div className={compact ? "px-3 py-2" : "space-y-2"} aria-hidden="true">
        <div className="h-16 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (error && actions.length === 0) {
    return (
      <div className={compact ? "px-3 py-2" : ""}>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void fetchActions()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (actions.length === 0) {
    if (compact || hideWhenEmpty) return null;
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center">
        <CalendarClock className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 font-medium">No pending AI requests</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Appointment requests that need your approval will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={compact ? "border-b px-3 py-2 sm:px-4" : "space-y-3"}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {actions.map((action) => (
        <div
          key={action.id}
          className="rounded-lg border border-border bg-card px-3 py-3 sm:px-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{actionLabel(action.toolName)}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{leadName(action)}</p>
              {action.summary.startsAt ? (
                <p className="mt-1 text-sm">
                  {formatDateTime(action.summary.startsAt)}
                  {action.summary.location ? ` · ${action.summary.location}` : ""}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Requested {formatDateTime(action.createdAt)}
                {action.expiresAt ? ` · expires ${formatDateTime(action.expiresAt)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {showConversationLink ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={actionCenterConversationHref(action.conversationId)}>
                    Open
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={busyId === action.id}
                onClick={() => void decide(action.id, "approve")}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === action.id}
                onClick={() => void decide(action.id, "reject")}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PendingAiActionsEmptyIcon() {
  return <AlertCircle className="h-6 w-6 text-muted-foreground" />;
}
