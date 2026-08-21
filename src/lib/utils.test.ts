import { describe, it, expect } from "vitest";
import { cn, getInitials, formatRelativeTime } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("handles falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});

describe("getInitials", () => {
  it("returns two-letter initials from a full name", () => {
    expect(getInitials("John Smith")).toBe("JS");
  });

  it("returns single letter for single-word name", () => {
    expect(getInitials("Alice")).toBe("A");
  });

  it("uppercases the result", () => {
    expect(getInitials("alice smith")).toBe("AS");
  });

  it("handles names with extra words (only first two)", () => {
    expect(getInitials("Mary Jane Watson")).toBe("MJ");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("returns 'just now' for timestamps under 45 seconds", () => {
    expect(formatRelativeTime("2026-08-20T11:59:30Z", now)).toBe("just now");
  });

  it("returns minutes ago under an hour", () => {
    expect(formatRelativeTime("2026-08-20T11:58:00Z", now)).toBe("2m ago");
  });

  it("returns hours ago under a day", () => {
    expect(formatRelativeTime("2026-08-20T10:00:00Z", now)).toBe("2h ago");
  });

  it("returns 'yesterday' for one day ago", () => {
    expect(formatRelativeTime("2026-08-19T12:00:00Z", now)).toBe("yesterday");
  });

  it("returns days ago under a week", () => {
    expect(formatRelativeTime("2026-08-17T12:00:00Z", now)).toBe("3d ago");
  });

  it("falls back to a calendar date for older timestamps", () => {
    expect(formatRelativeTime("2026-08-01T12:00:00Z", now)).toBe("Aug 1, 2026");
  });
});
