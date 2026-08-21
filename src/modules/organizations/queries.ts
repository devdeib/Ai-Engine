/**
 * Organization queries.
 *
 * All functions:
 * 1. Require the caller to pass the authenticated user's ID.
 * 2. Verify the user is a member of the target organization.
 * 3. NEVER trust an organization_id that came directly from the client
 *    as an authorization grant — only use it as a lookup key, then
 *    verify membership.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TenantAccessError, NotFoundError } from "@/lib/errors";
import type {
  Organization,
  OrganizationMember,
  OrganizationWithRole,
  MemberRole,
} from "@/lib/db/types";

/**
 * Verifies the user is a member of the organization.
 * Returns the member record if they are; throws TenantAccessError if not.
 *
 * This is the primary authorization guard for all organization operations.
 * Call it at the start of any function that touches org-scoped data.
 */
export async function requireOrgMembership(
  organizationId: string,
  userId: string
): Promise<OrganizationMember> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new TenantAccessError();
  }

  return data;
}

/**
 * Verifies the user has one of the required roles in the organization.
 * Throws TenantAccessError if they do not.
 */
export async function requireOrgRole(
  organizationId: string,
  userId: string,
  requiredRoles: MemberRole[]
): Promise<OrganizationMember> {
  const member = await requireOrgMembership(organizationId, userId);

  if (!requiredRoles.includes(member.role)) {
    throw new TenantAccessError();
  }

  return member;
}

/**
 * Returns a single organization by ID, verifying the user is a member.
 */
export async function getOrganization(
  organizationId: string,
  userId: string
): Promise<OrganizationWithRole> {
  const member = await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .is("deleted_at", null)
    .single();

  if (error || !data) {
    throw new NotFoundError("Organization");
  }

  const org = data as Organization;
  return { ...org, role: member.role };
}

/**
 * Returns all members of an organization.
 * Requires the requesting user to be a member themselves.
 */
export async function getOrganizationMembers(
  organizationId: string,
  userId: string
): Promise<(OrganizationMember & { profile: { display_name: string; avatar_url: string | null } })[]> {
  await requireOrgMembership(organizationId, userId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      *,
      profile:profiles (
        display_name,
        avatar_url
      )
    `
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch members: ${error.message}`);
  }

  return (data ?? []) as (OrganizationMember & {
    profile: { display_name: string; avatar_url: string | null };
  })[];
}

/**
 * Returns true if candidateUserId is a member of the given organization.
 *
 * Intentionally does NOT throw — this is a non-throwing predicate used to
 * validate a candidate user ID (e.g. an owner_id on a lead) before storing it.
 * Use requireOrgMembership when you need the guard that throws TenantAccessError.
 *
 * This never exposes cross-tenant information: if the user is not found in the
 * organization, it simply returns false.
 */
export async function isMemberOfOrg(
  organizationId: string,
  candidateUserId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", candidateUserId)
    .single();
  return !error && data !== null;
}

/**
 * Updates organization name.
 * Requires owner or admin role.
 */
export async function updateOrganization(
  organizationId: string,
  userId: string,
  updates: Pick<Organization, "name">
): Promise<Organization> {
  await requireOrgRole(organizationId, userId, ["owner", "admin"]);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from("organizations") as any;
  const { data, error } = await table
    .update({ name: updates.name })
    .eq("id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update organization: ${error?.message}`);
  }

  return data as Organization;
}
