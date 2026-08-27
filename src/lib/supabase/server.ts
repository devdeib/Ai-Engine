/**
 * Server-side Supabase client.
 * Must only be used in Server Components, API routes, and Server Actions.
 * Reads/writes cookies for session management.
 * Uses the public anon key — respects RLS.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/db/types";
import { getSupabaseClientOverride } from "@/lib/supabase/client-override";

export async function createClient() {
  const override = getSupabaseClientOverride();
  if (override) {
    return override as unknown as ReturnType<
      typeof createServerClient<Database>
    >;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from Server Component — cookies can only be set
            // from Server Actions or Route Handlers. This is safe to ignore;
            // the middleware will handle session refresh.
          }
        },
      },
    }
  );
}
