import { describe, it, expect } from "vitest";
import { effectiveAiToolActionStatus, isAiToolActionExpired } from "@/modules/ai/actions/map";

describe("AI tool action expiration", () => {
  it("treats pending actions with expires_at in the past as expired", () => {
    const action = {
      status: "pending" as const,
      expires_at: "2020-01-01T00:00:00.000Z",
    };
    expect(isAiToolActionExpired(action, new Date("2026-08-22T00:00:00Z"))).toBe(
      true
    );
    expect(
      effectiveAiToolActionStatus(action, new Date("2026-08-22T00:00:00Z"))
    ).toBe("expired");
  });

  it("does not expire executed actions", () => {
    const action = {
      status: "executed" as const,
      expires_at: "2020-01-01T00:00:00.000Z",
    };
    expect(isAiToolActionExpired(action, new Date("2026-08-22T00:00:00Z"))).toBe(
      false
    );
  });
});
