import { describe, it, expect } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  TenantAccessError,
  isAppError,
} from "@/lib/errors";

describe("AppError", () => {
  it("sets code, message, and statusCode correctly", () => {
    const err = new AppError("TEST_CODE", "Test message", 418);
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("Test message");
    expect(err.statusCode).toBe(418);
    expect(err).toBeInstanceOf(Error);
  });

  it("defaults statusCode to 500", () => {
    const err = new AppError("CODE", "msg");
    expect(err.statusCode).toBe(500);
  });
});

describe("AuthenticationError", () => {
  it("has statusCode 401 and code UNAUTHENTICATED", () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("UNAUTHENTICATED");
  });

  it("accepts a custom message", () => {
    const err = new AuthenticationError("Custom auth error");
    expect(err.message).toBe("Custom auth error");
  });
});

describe("AuthorizationError", () => {
  it("has statusCode 403 and code FORBIDDEN", () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });
});

describe("NotFoundError", () => {
  it("has statusCode 404 and code NOT_FOUND", () => {
    const err = new NotFoundError("Lead");
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Lead not found");
  });
});

describe("ValidationError", () => {
  it("has statusCode 422 and code VALIDATION_ERROR", () => {
    const err = new ValidationError("Bad input", { field: ["required"] });
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details).toEqual({ field: ["required"] });
  });
});

describe("ConflictError", () => {
  it("has statusCode 409 and code CONFLICT", () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });
});

describe("TenantAccessError", () => {
  it("has statusCode 403 and code TENANT_ACCESS_DENIED", () => {
    const err = new TenantAccessError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("is an AppError", () => {
    expect(isAppError(new TenantAccessError())).toBe(true);
  });
});

describe("isAppError", () => {
  it("returns true for AppError instances", () => {
    expect(isAppError(new AppError("C", "m"))).toBe(true);
    expect(isAppError(new TenantAccessError())).toBe(true);
    expect(isAppError(new AuthenticationError())).toBe(true);
  });

  it("returns false for non-AppError values", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});
