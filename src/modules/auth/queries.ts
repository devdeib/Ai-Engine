/**
 * Server-side authentication queries.
 * Returns typed, validated user and session data.
 * All functions require a server-side Supabase client.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "@/lib/errors";
import type { Profile, OrganizationWithRole } from "@/lib/db/types";

/**
 * Returns the currently authenticated user, or null if not signed in.
 * Safe to call from Server Components; does not throw.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the currently authenticated user.
 * Throws AuthenticationError if not signed in.
 * Use in API routes and server actions that require authentication.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthenticationError();
  }
  return user;
}

/**
 * Returns the user's profile row from the profiles table.
 * Throws if the user is not authenticated or the profile does not exist.
 */
export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    throw new AuthenticationError("User profile not found");
  }

  return data;
}

/**
 * Returns all organizations the authenticated user is a member of,
 * including their role in each.
 */
export async function getUserOrganizations(): Promise<OrganizationWithRole[]> {
  const supabase = await createClient();
  const user = await requireUser();

  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      role,
      organizations (
        id,
        name,
        slug,
        created_at,
        updated_at,
        deleted_at
      )
    `
    )
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Failed to fetch organizations: ${error.message}`);
  }

  type MemberWithOrg = {
    role: string;
    organizations: {
      id: string;
      name: string;
      slug: string;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    } | null;
  };

  return ((data ?? []) as MemberWithOrg[])
    .filter((row) => row.organizations !== null && row.organizations.deleted_at === null)
    .map((row) => ({
      ...(row.organizations as NonNullable<MemberWithOrg["organizations"]>),
      role: row.role as import("@/lib/db/types").MemberRole,
    }));
}
