import { describe, it, expect } from "vitest";
import { sanitizeAiReply, validateAiReply } from "@/modules/ai/schema";
import { AiMalformedResponseError } from "@/modules/ai/errors";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";

describe("validateAiReply", () => {
  it("trims a usable reply", () => {
    expect(validateAiReply("  Hello  ")).toBe("Hello");
    expect(sanitizeAiReply("  Hello  ")).toBe("Hello");
  });

  it("rejects empty output", () => {
    expect(() => validateAiReply("")).toThrow(AiMalformedResponseError);
  });

  it("rejects whitespace-only output", () => {
    expect(() => validateAiReply("   ")).toThrow(AiMalformedResponseError);
  });

  it("rejects non-string output", () => {
    expect(() => validateAiReply(42)).toThrow(AiMalformedResponseError);
    expect(() => validateAiReply(null)).toThrow(AiMalformedResponseError);
    expect(() => validateAiReply({ text: "hi" })).toThrow(AiMalformedResponseError);
  });

  it("rejects oversized output instead of truncating", () => {
    const text = "x".repeat(MESSAGE_BODY_MAX + 1);
    expect(() => validateAiReply(text)).toThrow(AiMalformedResponseError);
  });

  it("accepts a reply at the maximum length", () => {
    const text = "x".repeat(MESSAGE_BODY_MAX);
    expect(validateAiReply(text)).toHaveLength(MESSAGE_BODY_MAX);
  });
});