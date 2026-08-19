import { describe, it, expect } from "vitest";
import { validateParams } from "@/lib/api/validate";
import { ValidationError } from "@/lib/errors";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

describe("validateParams", () => {
  it("returns parsed values for valid input", () => {
    const result = validateParams({ page: "2", limit: "50" }, paginationSchema);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it("applies defaults for missing optional fields", () => {
    const result = validateParams({}, paginationSchema);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("throws ValidationError for invalid values", () => {
    expect(() =>
      validateParams({ page: "0" }, paginationSchema)
    ).toThrow(ValidationError);
  });

  it("throws ValidationError when limit exceeds max", () => {
    expect(() =>
      validateParams({ limit: "999" }, paginationSchema)
    ).toThrow(ValidationError);
  });
});
