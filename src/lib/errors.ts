/**
 * Application error types.
 * All application errors extend AppError for consistent handling.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message, 401);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  public readonly details: unknown;

  constructor(message = "Validation failed", details?: unknown) {
    super("VALIDATION_ERROR", message, 422);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super("CONFLICT", message, 409);
    this.name = "ConflictError";
  }
}

export class TenantAccessError extends AppError {
  constructor() {
    super(
      "TENANT_ACCESS_DENIED",
      "You do not have access to this organization",
      403
    );
    this.name = "TenantAccessError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
