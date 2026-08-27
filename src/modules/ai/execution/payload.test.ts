import { describe, it, expect, vi } from "vitest";
import { hashAiToolInput } from "@/modules/ai/actions/hash";
import { AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE } from "@/modules/ai/execution/constants";
import {
  buildServerFollowUpInput,
  followUpDueAtFromInbound,
} from "@/modules/ai/execution/payload";

describe("buildServerFollowUpInput", () => {
  it("sets dueAt to inbound created_at plus 24 hours", () => {
    const inbound = "2026-08-21T10:00:00Z";
    expect(followUpDueAtFromInbound(inbound)).toBe("2026-08-22T10:00:00.000Z");
    const parsed = buildServerFollowUpInput(inbound);
    expect(parsed).toEqual({
      title: AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE,
      notes: null,
      dueAt: "2026-08-22T10:00:00.000Z",
    });
  });

  it("is deterministic for the same inbound timestamp", () => {
    const inbound = "2026-08-21T10:00:00.000Z";
    const first = buildServerFollowUpInput(inbound);
    const second = buildServerFollowUpInput(inbound);
    expect(first).toEqual(second);
    expect(first).not.toBeNull();
    if (!first || !second) return;
    expect(hashAiToolInput({ ...first })).toBe(hashAiToolInput({ ...second }));
  });

  it("does not call Date.now", () => {
    const spy = vi.spyOn(Date, "now");
    buildServerFollowUpInput("2026-08-21T10:00:00Z");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("never copies model rationale into notes", () => {
    const parsed = buildServerFollowUpInput("2026-08-21T10:00:00Z");
    expect(parsed?.notes).toBeNull();
    expect(parsed?.title).toBe("Follow up");
    expect(JSON.stringify(parsed)).not.toContain("rationale");
  });

  it("returns null for an invalid inbound timestamp", () => {
    expect(buildServerFollowUpInput("not-a-date")).toBeNull();
  });
});
