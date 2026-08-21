import { describe, it, expect } from "vitest";
import { sanitizeAiReply } from "@/modules/ai/schema";
import { AiMalformedResponseError } from "@/modules/ai/errors";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";

describe("sanitizeAiReply", () => {
  it("trims a usable reply", () => {
    expect(sanitizeAiReply("  Hello  ")).toBe("Hello");
  });

  it("rejects empty output", () => {
    expect(() => sanitizeAiReply("   ")).toThrow(AiMalformedResponseError);
  });

  it("caps length to the message body maximum", () => {
    const text = "x".repeat(MESSAGE_BODY_MAX + 20);
    expect(sanitizeAiReply(text)).toHaveLength(MESSAGE_BODY_MAX);
  });
});
