"use client";

import { cn } from "@/lib/utils";
import type { LeadFollowUpStatus } from "@/lib/db/types";
import {
  FOLLOW_UP_STATUS_CLASSES,
  FOLLOW_UP_STATUS_LABELS,
} from "@/modules/follow-ups/lib/follow-up-status";

export interface FollowUpStatusBadgeProps {
  status: LeadFollowUpStatus;
  overdue?: boolean;
}

export function FollowUpStatusBadge({
  status,
  overdue = false,
}: FollowUpStatusBadgeProps) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
          FOLLOW_UP_STATUS_CLASSES[status]
        )}
      >
        {FOLLOW_UP_STATUS_LABELS[status]}
      </span>
      {overdue && status === "pending" && (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-destructive/10 text-red-700">
          Overdue
        </span>
      )}
    </span>
  );
}
