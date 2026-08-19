/**
 * Request validation helpers for API routes.
 * All input from external requests must be validated before use.
 */
import { type NextRequest } from "next/server";
import { type ZodSchema } from "zod";
import { ValidationError } from "@/lib/errors";

/**
 * Parses and validates the JSON body of an API request against a Zod schema.
 * Throws ValidationError if the body is invalid or does not match the schema.
 */
export async function validateBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError("Validation failed", result.error.flatten().fieldErrors);
  }

  return result.data;
}

/**
 * Validates URL search params against a Zod schema.
 */
export function validateParams<T>(
  params: Record<string, string | string[]>,
  schema: ZodSchema<T>
): T {
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationError(
      "Invalid query parameters",
      result.error.flatten().fieldErrors
    );
  }
  return result.data;
}
