"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConversationWithLead } from "@/lib/db/types";
import type { PublicAiSalesAnalysis } from "@/modules/ai/analysis/map";
import type { PublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";
import type {
  ExecutionPlanKind,
  PublicExecutionPlan,
} from "@/modules/ai/execution/plan";
import { datetimeLocalToIso } from "@/modules/appointments/components/appointment-form";
import {
  APPOINTMENT_LOCATION_MAX,
  APPOINTMENT_NOTES_MAX,
} from "@/modules/appointments/schema";

export interface AiOperatorInsightPanelProps {
  organizationId: string;
  conversationId?: string;
  leadId?: string;
  compact?: boolean;
  onAppointmentRequested?: () => void;
  onHandoffConfirmed?: (conversation: ConversationWithLead) => void;
}

const PLAN_KIND_LABELS: Record<ExecutionPlanKind, string> = {
  executable_follow_up: "Follow-up allowed by current policy",
  already_executed: "Already executed",
  blocked_missing_schedule: "Appointment blocked — missing schedule",
  blocked_no_auto_escalation: "Handoff is not auto-run",
  no_op: "No automatic CRM action",
  blocked: "Execution blocked",
};

function planKindLabel(kind: ExecutionPlanKind): string {
  return PLAN_KIND_LABELS[kind];
}

function skipReasonLabel(reason: PublicExecutionPlan["skipReason"]): string | null {
  if (!reason) return null;
  return reason.replace(/_/g, " ");
}

export function AiOperatorInsightPanel({
  organizationId,
  conversationId,
  leadId,
  compact = false,
  onAppointmentRequested,
  onHandoffConfirmed,
}: AiOperatorInsightPanelProps) {
  const [analysis, setAnalysis] = useState<PublicAiSalesAnalysis | null>(null);
  const [recommendation, setRecommendation] =
    useState<PublicAiSalesRecommendation | null>(null);
  const [resolvedConversationId, setResolvedConversationId] = useState<
    string | null
  >(conversationId ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let conversation = conversationId ?? null;
      if (!conversation && leadId) {
        const params = new URLSearchParams({
          lead_id: leadId,
          status: "open",
          limit: "1",
        });
        const convRes = await fetch(
          `/api/v1/organizations/${organizationId}/conversations?${params}`,
          { credentials: "same-origin" }
        );
        if (!convRes.ok) throw new Error("Failed to load conversation");
        const convJson = (await convRes.json()) as {
          data: ConversationWithLead[];
        };
        conversation = convJson.data[0]?.id ?? null;
      }
      setResolvedConversationId(conversation);
      if (!conversation) {
        setAnalysis(null);
        setRecommendation(null);
        return;
      }

      const [analysisRes, recommendationRes] = await Promise.all([
        fetch(
          `/api/v1/organizations/${organizationId}/conversations/${conversation}/ai/analyses/current`,
          { credentials: "same-origin" }
        ),
        fetch(
          `/api/v1/organizations/${organizationId}/conversations/${conversation}/ai/recommendations/current`,
          { credentials: "same-origin" }
        ),
      ]);

      if (analysisRes.status === 404) {
        setAnalysis(null);
      } else if (!analysisRes.ok) {
        throw new Error("Failed to load analysis");
      } else {
        const json = (await analysisRes.json()) as { data: PublicAiSalesAnalysis };
        setAnalysis(json.data);
      }

      if (recommendationRes.status === 404) {
        setRecommendation(null);
      } else if (!recommendationRes.ok) {
        throw new Error("Failed to load recommendation");
      } else {
        const json = (await recommendationRes.json()) as {
          data: PublicAiSalesRecommendation;
        };
        setRecommendation(json.data);
      }
    } catch {
      setError("Unable to load AI analysis and execution plan.");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, conversationId, leadId]);

  useEffect(() => {
    void fetchInsight();
  }, [fetchInsight]);

  const body = (
    <InsightBody
      organizationId={organizationId}
      conversationId={resolvedConversationId}
      analysis={analysis}
      recommendation={recommendation}
      hasConversation={Boolean(resolvedConversationId)}
      isLoading={isLoading}
      error={error}
      onRetry={() => void fetchInsight()}
      onAppointmentRequested={onAppointmentRequested}
      onHandoffConfirmed={onHandoffConfirmed}
      onRefresh={() => void fetchInsight()}
      compact={compact}
    />
  );

  if (compact) {
    if (isLoading) {
      return (
        <div className="border-b px-3 py-2 sm:px-4" aria-hidden="true">
          <div className="h-16 rounded-md bg-muted animate-pulse" />
        </div>
      );
    }
    if (!resolvedConversationId && !error) return null;
    return <div className="border-b px-3 py-2 sm:px-4">{body}</div>;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          AI insight
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function InsightBody({
  organizationId,
  conversationId,
  analysis,
  recommendation,
  hasConversation,
  isLoading,
  error,
  onRetry,
  onAppointmentRequested,
  onHandoffConfirmed,
  onRefresh,
  compact,
}: {
  organizationId: string;
  conversationId: string | null;
  analysis: PublicAiSalesAnalysis | null;
  recommendation: PublicAiSalesRecommendation | null;
  hasConversation: boolean;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onAppointmentRequested?: () => void;
  onHandoffConfirmed?: (conversation: ConversationWithLead) => void;
  onRefresh: () => void;
  compact: boolean;
}) {
  if (isLoading) {
    return <div className="h-16 rounded-md bg-muted animate-pulse" aria-hidden="true" />;
  }

  if (error) {
    return (
      <div>
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (!hasConversation) {
    return (
      <p className="text-sm text-muted-foreground">
        Start a conversation to see the current AI analysis and execution plan.
      </p>
    );
  }

  if (!analysis && !recommendation) {
    return (
      <p className="text-sm text-muted-foreground">
        No current AI analysis or recommendation for this conversation.
      </p>
    );
  }

  const plan = recommendation?.plan ?? null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current analysis
        </p>
        {analysis?.analysis ? (
          <p className="mt-1 text-sm">
            {analysis.analysis.nextBestAction.replace(/_/g, " ")}
            {analysis.isCurrent ? "" : " · stale"}
            {` · confidence ${Math.round(analysis.analysis.confidence * 100)}%`}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {analysis ? "Analysis was not recorded." : "No current analysis."}
          </p>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Current recommendation
        </p>
        {recommendation ? (
          <p className="mt-1 text-sm">
            {recommendation.recommendedAction.replace(/_/g, " ")}
            {recommendation.isCurrent ? "" : " · stale"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No current recommendation.
          </p>
        )}
      </section>

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Execution plan
        </p>
        {plan ? (
          <div className="mt-1 space-y-1 text-sm">
            <p>{planKindLabel(plan.kind)}</p>
            <p className="text-muted-foreground">
              {plan.executable
                ? "Current policy would allow follow-up execution"
                : "Not currently executable"}
              {" · "}
              {plan.observability === "on_ledger"
                ? "On execution ledger"
                : "Not on execution ledger"}
            </p>
            {plan.ledger ? (
              <p className="text-muted-foreground">
                Ledger: {plan.ledger.toolName.replace(/_/g, " ")} ·{" "}
                {plan.ledger.status}
              </p>
            ) : null}
            {skipReasonLabel(plan.skipReason) ? (
              <p className="text-muted-foreground">
                Reason: {skipReasonLabel(plan.skipReason)}
              </p>
            ) : null}
            {conversationId &&
            recommendation?.isCurrent &&
            recommendation.recommendedAction === "suggest_appointment_approval" &&
            plan.kind === "blocked_missing_schedule" ? (
              <AppointmentRequestForm
                organizationId={organizationId}
                conversationId={conversationId}
                onSuccess={() => {
                  onRefresh();
                  onAppointmentRequested?.();
                }}
              />
            ) : null}
            {conversationId &&
            recommendation?.isCurrent &&
            recommendation.recommendedAction === "suggest_human_handoff" &&
            plan.kind === "blocked_no_auto_escalation" ? (
              <HandoffConfirmControl
                organizationId={organizationId}
                conversationId={conversationId}
                onSuccess={(updated) => {
                  onRefresh();
                  onHandoffConfirmed?.(updated);
                }}
              />
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            No execution plan.
          </p>
        )}
      </section>
    </div>
  );
}

function AppointmentRequestForm({
  organizationId,
  conversationId,
  onSuccess,
}: {
  organizationId: string;
  conversationId: string;
  onSuccess: () => void;
}) {
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const isoStart = datetimeLocalToIso(startsAt);
    if (!isoStart) {
      setError("Start date is required.");
      return;
    }
    const isoEnd = datetimeLocalToIso(endsAt);
    if (endsAt.trim() && !isoEnd) {
      setError("End date must be a valid date and time.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversationId}/ai/recommendations/current/appointment-request`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startsAt: isoStart,
            ...(isoEnd ? { endsAt: isoEnd } : {}),
            location: location.trim() ? location.trim() : null,
            notes: notes.trim() ? notes.trim() : null,
          }),
        }
      );
      if (res.status === 422) {
        throw new Error("Please provide a valid appointment time.");
      }
      if (res.status === 409) {
        throw new Error("This recommendation cannot create an appointment request.");
      }
      if (!res.ok) {
        throw new Error("Unable to request appointment approval.");
      }
      setStartsAt("");
      setEndsAt("");
      setLocation("");
      setNotes("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request appointment approval.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="mt-2 space-y-2 rounded-md border bg-background p-3"
      aria-label="Request appointment approval"
    >
      <p className="text-xs text-muted-foreground">
        Provide a time. A teammate must still approve before the appointment is created.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ai-appointment-start">Start</Label>
          <Input
            id="ai-appointment-start"
            name="startsAt"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            disabled={isSubmitting}
            aria-label="Start"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-appointment-end">End (optional)</Label>
          <Input
            id="ai-appointment-end"
            name="endsAt"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            disabled={isSubmitting}
            aria-label="End"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ai-appointment-location">Location (optional)</Label>
        <Input
          id="ai-appointment-location"
          name="location"
          value={location}
          maxLength={APPOINTMENT_LOCATION_MAX}
          onChange={(e) => setLocation(e.target.value)}
          disabled={isSubmitting}
          aria-label="Location"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ai-appointment-notes">Notes (optional)</Label>
        <Input
          id="ai-appointment-notes"
          name="notes"
          value={notes}
          maxLength={APPOINTMENT_NOTES_MAX}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isSubmitting}
          aria-label="Notes"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" disabled={isSubmitting}>
        Request approval
      </Button>
    </form>
  );
}

function HandoffConfirmControl({
  organizationId,
  conversationId,
  onSuccess,
}: {
  organizationId: string;
  conversationId: string;
  onSuccess: (conversation: ConversationWithLead) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${organizationId}/conversations/${conversationId}/ai/recommendations/current/handoff`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (res.status === 409) {
        throw new Error("This recommendation cannot escalate to a human.");
      }
      if (!res.ok) {
        throw new Error("Unable to take over this conversation.");
      }
      const json = (await res.json()) as { data: ConversationWithLead };
      onSuccess(json.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to take over this conversation."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">
        The AI will stop replying until a teammate resumes it.
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={isSubmitting}
        onClick={() => void handleConfirm()}
      >
        Take over conversation
      </Button>
    </div>
  );
}
