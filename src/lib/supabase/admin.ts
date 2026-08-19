/**
 * Supabase admin (service-role) client.
 *
 * SECURITY CRITICAL:
 * - This client bypasses Row Level Security.
 * - It must ONLY be used for:
 *   a) System-level operations where RLS would prevent legitimate access
 *      (e.g., creating an organization on behalf of a new user)
 *   b) Background jobs / cron operations
 *   c) Admin-privileged API endpoints that have already performed
 *      their own application-level authorization checks
 *
 * - NEVER pass this client to user-facing code.
 * - NEVER import this file in Client Components or shared lib files.
 * - All callers must explicitly scope queries to the correct organization.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/db/types";

let _adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (_adminClient) return _adminClient;

  _adminClient = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return _adminClient;
}
