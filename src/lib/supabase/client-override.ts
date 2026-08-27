/**
 * Optional request-scoped Supabase client override.
 * Used only by the AI job worker when running without a user session
 * (cron drain). User-facing requests never set this.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

type SupabaseClient = ReturnType<typeof createSupabaseClient<Database>>;

const store = new AsyncLocalStorage<SupabaseClient>();

export function getSupabaseClientOverride(): SupabaseClient | undefined {
  return store.getStore();
}

export function runWithSupabaseClientOverride<T>(
  client: SupabaseClient,
  fn: () => Promise<T>
): Promise<T> {
  return store.run(client, fn);
}
