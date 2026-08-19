/**
 * Standardized API response helpers.
 *
 * All API routes must use these helpers to ensure consistent response shapes:
 *   Success: { data: T, meta?: object }
 *   Error:   { error: { code: string, message: string, details?: unknown } }
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  AppError,
  AuthenticationError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

export function successResponse<T>(
  data: T,
  options: { status?: number; meta?: Record<string, unknown> } = {}
): NextResponse {
  const { status = 200, meta } = options;
  const body = meta ? { data, meta } : { data };
  return NextResponse.json(body, { status });
}

export function errorResponse(
  code: string,
  message: string,
  options: { status?: number; details?: unknown } = {}
): NextResponse {
  const { status = 500, details } = options;
  const body = details
    ? { error: { code, message, details } }
    : { error: { code, message } };
  return NextResponse.json(body, { status });
}

/**
 * Catches any thrown error and returns a standardized error response.
 * Use this to wrap API route handlers:
 *
 *   export async function GET(req: NextRequest) {
 *     return handleApiError(() => myHandler(req));
 *   }
 */
export async function handleApiError(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ZodError) {
      return errorResponse("VALIDATION_ERROR", "Validation failed", {
        status: 422,
        details: err.flatten().fieldErrors,
      });
    }

    if (err instanceof ValidationError) {
      return errorResponse(err.code, err.message, {
        status: err.statusCode,
        details: err.details,
      });
    }

    if (err instanceof AppError) {
      if (!(err instanceof AuthenticationError)) {
        logger.warn("API error", { code: err.code, message: err.message });
      }
      return errorResponse(err.code, err.message, {
        status: err.statusCode,
      });
    }

    logger.error("Unhandled API error", {
      error: err instanceof Error ? err.message : String(err),
    });

    return errorResponse("INTERNAL_ERROR", "An unexpected error occurred", {
      status: 500,
    });
  }
}
