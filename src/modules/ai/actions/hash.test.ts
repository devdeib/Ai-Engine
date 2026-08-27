import { describe, it, expect } from "vitest";
import { canonicalJson, hashAiToolInput } from "@/modules/ai/actions/hash";

describe("canonicalJson", () => {
  it("sorts object keys and omits undefined", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("does not include identity fields unless the caller passed them", () => {
    const hashed = hashAiToolInput({ title: "Call", dueAt: "2026-08-22T10:00:00.000Z" });
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toMatch(/organization/i);
  });

  it("is stable for the same validated business fields", () => {
    const left = hashAiToolInput({
      notes: null,
      title: "Call",
      dueAt: "2026-08-22T10:00:00.000Z",
    });
    const right = hashAiToolInput({
      dueAt: "2026-08-22T10:00:00.000Z",
      title: "Call",
      notes: null,
    });
    expect(left).toBe(right);
  });

  it("changes when business fields change", () => {
    const left = hashAiToolInput({ title: "Call", dueAt: "2026-08-22T10:00:00.000Z" });
    const right = hashAiToolInput({ title: "Visit", dueAt: "2026-08-22T10:00:00.000Z" });
    expect(left).not.toBe(right);
  });
});
