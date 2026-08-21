import { describe, it, expect } from "vitest";
import {
  ACTIVITY_TYPE_LABELS,
  MANUAL_ACTIVITY_TYPE_OPTIONS,
} from "@/modules/leads/activities/lib/activity-labels";
import type { LeadActivityType } from "@/lib/db/types";

describe("activity type labels", () => {
  it("covers every activity type", () => {
    const types: LeadActivityType[] = [
      "note",
      "call",
      "email",
      "meeting",
      "status_change",
      "conversation",
      "follow_up",
      "appointment",
      "ai",
    ];
    for (const type of types) {
      expect(ACTIVITY_TYPE_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it("labels the Phase 3.6 types", () => {
    expect(ACTIVITY_TYPE_LABELS.conversation).toBe("Conversation");
    expect(ACTIVITY_TYPE_LABELS.follow_up).toBe("Follow-up");
    expect(ACTIVITY_TYPE_LABELS.appointment).toBe("Appointment");
  });

  it("labels the Phase 4 AI type", () => {
    expect(ACTIVITY_TYPE_LABELS.ai).toBe("AI");
  });

  it("keeps the manual form options to the original five types", () => {
    expect(MANUAL_ACTIVITY_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "note",
      "call",
      "email",
      "meeting",
      "status_change",
    ]);
  });
});
