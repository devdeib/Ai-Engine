import { describe, it, expect } from "vitest";
import { cn, getInitials } from "@/lib/utils";

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
