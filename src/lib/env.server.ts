/**
 * Server-only environment configuration.
 *
 * This file must ONLY be imported in server-side code:
 * - API route handlers (app/api/*)
 * - Server Actions
 * - Server Components that call server-only functions
 * - lib/supabase/admin.ts
 *
 * Importing this in a Client Component or a file that gets bundled for the
 * browser will cause a build error (intentional — Next.js "server-only" guard).
 */
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

function parseServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(
      `Missing or invalid server environment variables:\n${JSON.stringify(formatted, null, 2)}`
    );
  }

  return result.data;
}

export const serverEnv = parseServerEnv();
