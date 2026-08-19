import { describe, it, expect } from "vitest";
import { successResponse, errorResponse, handleApiError } from "@/lib/api/response";
import {
  AuthenticationError,
  ValidationError,
  TenantAccessError,
} from "@/lib/errors";
import { ZodError, z } from "zod";

describe("successResponse", () => {
  it("returns 200 with data envelope by default", async () => {
    const res = successResponse({ id: "123" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { id: "123" } });
  });

  it("includes meta when provided", async () => {
    const res = successResponse([1, 2], { status: 201, meta: { count: 2 } });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.meta).toEqual({ count: 2 });
  });
});

describe("errorResponse", () => {
  it("returns error envelope with code and message", async () => {
    const res = errorResponse("NOT_FOUND", "Resource not found", { status: 404 });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
  });

  it("includes details when provided", async () => {
    const res = errorResponse("VALIDATION_ERROR", "Bad input", {
      status: 422,
      details: { name: ["required"] },
    });
    const body = await res.json();
    expect(body.error.details).toEqual({ name: ["required"] });
  });
});

describe("handleApiError", () => {
  it("passes through successful responses", async () => {
    const res = await handleApiError(async () =>
      successResponse({ ok: true })
    );
    const body = await res.json();
    expect(body.data).toEqual({ ok: true });
  });

  it("handles AuthenticationError as 401", async () => {
    const res = await handleApiError(async () => {
      throw new AuthenticationError();
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("handles TenantAccessError as 403", async () => {
    const res = await handleApiError(async () => {
      throw new TenantAccessError();
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("handles ValidationError as 422", async () => {
    const res = await handleApiError(async () => {
      throw new ValidationError("Bad input", { field: ["required"] });
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("handles ZodError as 422 with field errors", async () => {
    const schema = z.object({ name: z.string().min(1) });
    let zodErr: ZodError | null = null;
    const result = schema.safeParse({ name: "" });
    if (!result.success) zodErr = result.error;

    const res = await handleApiError(async () => {
      throw zodErr!;
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("handles unknown errors as 500", async () => {
    const res = await handleApiError(async () => {
      throw new Error("Some unexpected error");
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
