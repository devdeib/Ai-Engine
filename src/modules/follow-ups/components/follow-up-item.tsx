"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import type { LeadFollowUp } from "@/lib/db/types";
import { isFollowUpOverdue } from "@/modules/follow-ups/lib/follow-up-status";
import { FollowUpStatusBadge } from "@/modules/follow-ups/components/follow-up-status-badge";

export interface FollowUpItemProps {
  followUp: LeadFollowUp;
  assigneeName: string | null;
  now?: Date;
  isUpdating?: boolean;
  error?: string | null;
  onComplete?: (followUpId: string) => void;
  onCancel?: (followUpId: string) => void;
}

export function FollowUpItem({
  followUp,
  assigneeName,
  now,
  isUpdating = false,
  error = null,
  onComplete,
  onCancel,
}: FollowUpItemProps) {
  const overdue = isFollowUpOverdue(followUp, now);
  const pending = followUp.status === "pending";

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium break-words">{followUp.title}</p>
          <p className="text-xs text-muted-foreground">
            Due{" "}
            <time dateTime={followUp.due_at}>
              {formatDateTime(followUp.due_at)}
            </time>
            <span aria-hidden="true"> · </span>
            {assigneeName ?? "Unassigned"}
          </p>
        </div>
        <FollowUpStatusBadge status={followUp.status} overdue={overdue} />
      </div>

      {followUp.notes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
          {followUp.notes}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {pending && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isUpdating}
            onClick={() => onComplete?.(followUp.id)}
          >
            {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Complete
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUpdating}
            onClick={() => onCancel?.(followUp.id)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
