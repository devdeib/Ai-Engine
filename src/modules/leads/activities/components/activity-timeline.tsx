"use client";

/**
 * ActivityTimeline — displays the chronological activity history for a lead
 * and provides a form to log new activities.
 *
 * Consumes:
 *   GET  /api/v1/organizations/:organizationId/leads/:leadId/activities
 *   POST /api/v1/organizations/:organizationId/leads/:leadId/activities
 *
 * The component owns its own fetch state so it can be embedded in the Lead
 * Detail page without coupling LeadDetailClient to the activity API.
 */

import { useState, useEffect, useCallback } from "react";
import {
  StickyNote,
  Phone,
  Mail,
  CalendarDays,
  CalendarCheck,
  TrendingUp,
  MessageSquare,
  Clock,
  Bot,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn, formatDateTime } from "@/lib/utils";
import type { LeadActivity, LeadActivityType } from "@/lib/db/types";
import type { ManualActivityType } from "@/modules/leads/activities/schema";
import {
  ACTIVITY_TYPE_LABELS,
  MANUAL_ACTIVITY_TYPE_OPTIONS,
} from "@/modules/leads/activities/lib/activity-labels";

export { ACTIVITY_TYPE_LABELS };

const ACTIVITY_ICONS: Record<
  LeadActivityType,
  React.ComponentType<{ className?: string }>
> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  meeting: CalendarDays,
  status_change: TrendingUp,
  conversation: MessageSquare,
  follow_up: Clock,
  appointment: CalendarCheck,
  ai: Bot,
};

/** Tailwind classes for the icon badge per activity type. */
const ACTIVITY_ICON_BG: Record<LeadActivityType, string> = {
  note: "bg-gray-100 text-gray-600",
  call: "bg-blue-100 text-blue-600",
  email: "bg-purple-100 text-purple-600",
  meeting: "bg-green-100 text-green-600",
  status_change: "bg-amber-100 text-amber-600",
  conversation: "bg-sky-100 text-sky-700",
  follow_up: "bg-orange-100 text-orange-700",
  appointment: "bg-teal-100 text-teal-700",
  ai: "bg-indigo-100 text-indigo-700",
};

// ---------------------------------------------------------------------------
// Shared select class — consistent with the rest of the form controls
// ---------------------------------------------------------------------------

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1",
  "text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50"
);

// ---------------------------------------------------------------------------
// Single timeline entry
// ---------------------------------------------------------------------------

function ActivityItem({ activity }: { activity: LeadActivity }) {
  const Icon = ACTIVITY_ICONS[activity.type];
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type];
  return (
    <li
      className="flex gap-3 pb-4 last:pb-0"
      aria-label={`${typeLabel} activity`}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          ACTIVITY_ICON_BG[activity.type]
        )}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs font-medium">{typeLabel}</span>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">
            ·
          </span>
          <time
            className="text-xs text-muted-foreground"
            dateTime={activity.created_at}
          >
            {formatDateTime(activity.created_at)}
          </time>
        </div>
        <p className="mt-0.5 break-words whitespace-pre-wrap text-sm">
          {activity.content}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ActivitySkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-3 w-32 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActivityTimelineProps {
  organizationId: string;
  leadId: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityTimeline({
  organizationId,
  leadId,
}: ActivityTimelineProps) {
  // ── Timeline state ────────────────────────────────────────────────────────
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [formType, setFormType] = useState<ManualActivityType>("note");
  const [formContent, setFormContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch activities ──────────────────────────────────────────────────────

  const fetchActivities = useCallback(async () => {
    setIsLoadingActivities(true);
    setFetchError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/activities?page=1&limit=20`,
        { credentials: "same-origin" }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to load activities");
      }
      const json = (await res.json()) as { data: LeadActivity[] };
      setActivities(json.data);
    } catch {
      setFetchError("Failed to load activity timeline.");
    } finally {
      setIsLoadingActivities(false);
    }
  }, [organizationId, leadId]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  // ── Form submit ───────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContent.trim()) {
      setSubmitError("Content is required.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/leads/${leadId}/activities`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ type: formType, content: formContent.trim() }),
        }
      );
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({ error: { message: "Unknown error" } }))) as {
          error: { message: string };
        };
        throw new Error(body?.error?.message ?? "Failed to log activity");
      }
      setFormContent("");
      setFormType("note");
      await fetchActivities();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to log activity."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Add activity form ─────────────────────────────────────────── */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-3"
          aria-label="Log activity"
        >
          <div className="flex items-center gap-3">
            <Label htmlFor="activity-type" className="shrink-0 text-sm">
              Type
            </Label>
            <select
              id="activity-type"
              className={selectClass}
              value={formType}
              onChange={(e) =>
                setFormType(e.target.value as ManualActivityType)
              }
              disabled={isSubmitting}
              aria-label="Activity type"
            >
              {MANUAL_ACTIVITY_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <textarea
            id="activity-content"
            placeholder="Add a note, log a call, or record any event…"
            className={cn(
              "flex min-h-[72px] w-full resize-none rounded-md border border-input",
              "bg-transparent px-3 py-2 text-sm shadow-sm transition-colors",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            disabled={isSubmitting}
            aria-label="Activity content"
          />

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !formContent.trim()}
            >
              {isSubmitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Log Activity
            </Button>
          </div>
        </form>

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <div className="border-t" aria-hidden="true" />

        {isLoadingActivities ? (
          <ActivitySkeleton />
        ) : fetchError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchActivities()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        ) : (
          <ul className="space-y-0" aria-label="Activity timeline">
            {activities.map((activity) => (
              <ActivityItem key={activity.id} activity={activity} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
