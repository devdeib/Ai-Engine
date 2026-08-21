import { describe, it, expect } from "vitest";
import {
  FOLLOW_UP_STATUS_LABELS,
  followUpQueueBucket,
  isFollowUpOverdue,
} from "@/modules/follow-ups/lib/follow-up-status";

const NOW = new Date("2026-08-20T12:00:00Z");

describe("follow-up status labels", () => {
  it("labels pending, completed, and cancelled", () => {
    expect(FOLLOW_UP_STATUS_LABELS.pending).toBe("Pending");
    expect(FOLLOW_UP_STATUS_LABELS.completed).toBe("Completed");
    expect(FOLLOW_UP_STATUS_LABELS.cancelled).toBe("Cancelled");
  });
});

describe("isFollowUpOverdue", () => {
  it("is true for pending follow-ups whose due_at is in the past", () => {
    expect(
      isFollowUpOverdue(
        { status: "pending", due_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(true);
  });

  it("is false for pending follow-ups whose due_at is in the future", () => {
    expect(
      isFollowUpOverdue(
        { status: "pending", due_at: "2026-08-22T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });

  it("is false for completed follow-ups even when due_at is in the past", () => {
    expect(
      isFollowUpOverdue(
        { status: "completed", due_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });

  it("is false for cancelled follow-ups even when due_at is in the past", () => {
    expect(
      isFollowUpOverdue(
        { status: "cancelled", due_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });
});

describe("followUpQueueBucket", () => {
  it("puts past-due pending items in overdue", () => {
    expect(
      followUpQueueBucket(
        { status: "pending", due_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe("overdue");
  });

  it("puts completed and cancelled items in done", () => {
    expect(
      followUpQueueBucket(
        { status: "completed", due_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe("done");
    expect(
      followUpQueueBucket(
        { status: "cancelled", due_at: "2026-08-22T10:00:00Z" },
        NOW
      )
    ).toBe("done");
  });

  it("puts a future pending item after today in upcoming", () => {
    expect(
      followUpQueueBucket(
        { status: "pending", due_at: "2026-08-25T10:00:00Z" },
        NOW
      )
    ).toBe("upcoming");
  });
});
