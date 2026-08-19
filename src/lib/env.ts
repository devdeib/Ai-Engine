/**
 * Typed, validated environment configuration.
 *
 * Public variables (NEXT_PUBLIC_*) are safe to use in both server and client code.
 * Secret variables are validated at server startup and must NEVER be imported
 * in any file that touches the client bundle.
 *
 * Import { env } from "@/lib/env" for public-safe variables anywhere.
 * Import { serverEnv } from "@/lib/env.server" for secrets — server-only files only.
 */

import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .default("http://localhost:3000"),
});

function parsePublicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(
      `Missing or invalid environment variables:\n${JSON.stringify(formatted, null, 2)}`
    );
  }

  return result.data;
}

export const env = parsePublicEnv();
