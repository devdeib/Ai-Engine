import { describe, it, expect } from "vitest";
import { listAiActionCenterQuerySchema } from "@/modules/ai/action-center/schema";

describe("listAiActionCenterQuerySchema", () => {
  it("defaults to page 1 and limit 20", () => {
    expect(listAiActionCenterQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
    });
  });

  it("rejects invalid pagination", () => {
    expect(listAiActionCenterQuerySchema.safeParse({ page: "0" }).success).toBe(
      false
    );
    expect(listAiActionCenterQuerySchema.safeParse({ limit: "101" }).success).toBe(
      false
    );
  });
});
