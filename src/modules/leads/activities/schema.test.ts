/**
 * Activity schema tests — manual vs recorded types, content bounds.
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVITY_CONTENT_MAX,
  boundActivityContent,
  createActivitySchema,
  leadActivityTypeSchema,
  recordActivitySchema,
} from "@/modules/leads/activities/schema";

describe("leadActivityTypeSchema", () => {
  it("accepts original, Phase 3.6, and Phase 4 activity types", () => {
    for (const type of [
      "note",
      "call",
      "email",
      "meeting",
      "status_change",
      "conversation",
      "follow_up",
      "appointment",
      "ai",
    ] as const) {
      expect(leadActivityTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects unknown types", () => {
    expect(leadActivityTypeSchema.safeParse("whatsapp").success).toBe(false);
  });
});

describe("createActivitySchema — public/manual API", () => {
  it("accepts the original manual types", () => {
    expect(
      createActivitySchema.safeParse({ type: "note", content: "Hello" }).success
    ).toBe(true);
    expect(
      createActivitySchema.safeParse({ type: "status_change", content: "New" })
        .success
    ).toBe(true);
  });

  it("rejects internally recorded types so clients cannot spoof them", () => {
    expect(
      createActivitySchema.safeParse({
        type: "conversation",
        content: "Conversation started",
      }).success
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        type: "follow_up",
        content: "Follow-up created: Call",
      }).success
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        type: "appointment",
        content: "Appointment scheduled",
      }).success
    ).toBe(false);
    expect(
      createActivitySchema.safeParse({
        type: "ai",
        content: "AI response generated",
      }).success
    ).toBe(false);
  });

  it("rejects oversized content instead of truncating", () => {
    expect(
      createActivitySchema.safeParse({
        type: "note",
        content: "x".repeat(ACTIVITY_CONTENT_MAX + 1),
      }).success
    ).toBe(false);
  });

  it("strips organization_id, user_id, and lead_id", () => {
    const result = createActivitySchema.parse({
      type: "note",
      content: "Hello",
      organization_id: "org",
      user_id: "user",
      lead_id: "lead",
    });
    expect(result).toEqual({ type: "note", content: "Hello" });
  });
});

describe("recordActivitySchema — internal recording", () => {
  it("accepts conversation, follow_up, and appointment", () => {
    expect(
      recordActivitySchema.safeParse({
        type: "conversation",
        content: "Conversation started",
      }).success
    ).toBe(true);
    expect(
      recordActivitySchema.safeParse({
        type: "follow_up",
        content: "Follow-up created: Call",
      }).success
    ).toBe(true);
    expect(
      recordActivitySchema.safeParse({
        type: "appointment",
        content: "Appointment scheduled",
      }).success
    ).toBe(true);
    expect(
      recordActivitySchema.safeParse({
        type: "ai",
        content: "AI response generated",
      }).success
    ).toBe(true);
  });

  it("truncates oversized derived content instead of failing", () => {
    const result = recordActivitySchema.parse({
      type: "follow_up",
      content: "x".repeat(ACTIVITY_CONTENT_MAX + 50),
    });
    expect(result.content).toHaveLength(ACTIVITY_CONTENT_MAX);
  });
});

describe("boundActivityContent", () => {
  it("trims and leaves short content unchanged", () => {
    expect(boundActivityContent("  Hello  ")).toBe("Hello");
  });

  it("truncates to ACTIVITY_CONTENT_MAX", () => {
    expect(boundActivityContent("x".repeat(ACTIVITY_CONTENT_MAX + 1))).toHaveLength(
      ACTIVITY_CONTENT_MAX
    );
  });
});
