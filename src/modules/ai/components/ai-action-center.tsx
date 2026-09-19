"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { PendingAiActionsPanel } from "@/modules/ai/components/pending-ai-actions-panel";
import type {
  ActionCenterRecommendationItem,
  AiActionCenter as AiActionCenterData,
} from "@/modules/ai/action-center/types";

export interface AiActionCenterProps {
  organizationId: string;
}

function leadName(item: ActionCenterRecommendationItem): string {
  if (!item.lead) return "Lead";
  const name = `${item.lead.firstName} ${item.lead.lastName}`.trim();
  return name || "Lead";
}

function recommendationActionLabel(
  kind: ActionCenterRecommendationItem["kind"]
): string {
  if (kind === "appointment_needs_scheduling") {
    return "Review / Schedule";
  }
  return "Review / Take over";
}

function recommendationStatus(item: ActionCenterRecommendationItem): string {
  if (item.planKind === "blocked_missing_schedule") {
    return "Waiting for a human schedule";
  }
  return "Waiting for operator take-over";
}

export function AiActionCenter({ organizationId }: AiActionCenterProps) {
  const [data, setData] = useState<AiActionCenterData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchCenter = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/ai/action-center`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error("Failed to load action center");
      const json = (await res.json()) as { data: AiActionCenterData };
      setData(json.data);
    } catch {
      setError("Unable to load the AI action center.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void fetchCenter();
  }, [fetchCenter, refreshKey]);

  function refresh() {
    setRefreshKey((value) => value + 1);
  }

  const appointmentItems =
    data?.recommendationItems.filter(
      (item) => item.kind === "appointment_needs_scheduling"
    ) ?? [];
  const handoffItems =
    data?.recommendationItems.filter(
      (item) => item.kind === "human_handoff_recommended"
    ) ?? [];
  const counts = data?.counts;
  const hasWork = (counts?.total ?? 0) > 0;
  const showEmpty =
    !isLoading && !error && data !== null && !hasWork;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">AI Action Center</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={isLoading}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {counts ? (
        <p className="text-sm text-muted-foreground" data-testid="action-center-counts">
          {counts.total} need attention
          {" · "}
          {counts.pendingAppointments} pending approval
          {" · "}
          {counts.appointmentRecommendations} need scheduling
          {" · "}
          {counts.handoffRecommendations} handoff recommended
        </p>
      ) : null}

      {error ? (
        <div>
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => refresh()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-16 rounded-md bg-muted animate-pulse" />
          <div className="h-16 rounded-md bg-muted animate-pulse" />
        </div>
      ) : null}

      {showEmpty ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center">
          <CalendarClock className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 font-medium">No action needed</p>
          <p className="mt-1 text-sm text-muted-foreground">
            There are no pending appointment approvals, scheduling requests, or
            handoff recommendations right now.
          </p>
        </div>
      ) : null}

      {!isLoading && hasWork ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-tight">Needs attention</h2>

          {(data?.pendingActions.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Appointment approval pending</h3>
              <PendingAiActionsPanel
                organizationId={organizationId}
                refreshKey={refreshKey}
                hideWhenEmpty
                showConversationLink
                onDecision={() => refresh()}
              />
            </div>
          ) : null}

          {appointmentItems.length > 0 ? (
            <RecommendationGroup
              title="Appointment needs scheduling"
              items={appointmentItems}
            />
          ) : null}

          {handoffItems.length > 0 ? (
            <RecommendationGroup
              title="Human handoff recommended"
              items={handoffItems}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function RecommendationGroup({
  title,
  items,
}: {
  title: string;
  items: ActionCenterRecommendationItem[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border bg-background px-3 py-3 sm:px-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{leadName(item)}</p>
                <p className="mt-1 text-sm">{recommendationStatus(item)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {recommendationActionLabel(item.kind)}
                  {" · "}
                  {formatDateTime(item.createdAt)}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={item.href}>Open conversation</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
