/**
 * API route authentication and authorization helpers.
 *
 * Use these in API route handlers to:
 * 1. Verify the request has a valid session.
 * 2. Resolve the organization context from the request.
 * 3. Verify the user is a member of the organization.
 *
 * CRITICAL: Never use the organization_id from the request body/params as
 * the authorization source. Always verify membership independently.
 */
import "server-only";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/supabase-js";
import type { OrganizationMember, MemberRole } from "@/lib/db/types";

interface AuthenticatedContext {
  user: User;
}

interface OrganizationContext extends AuthenticatedContext {
  member: OrganizationMember;
  organizationId: string;
}

/**
 * Extracts and validates the authenticated user from a request.
 * Throws AuthenticationError if no valid session is present.
 */
export async function getAuthContext(
  _req: NextRequest
): Promise<AuthenticatedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new AuthenticationError();
  }

  return { user };
}

/**
 * Extracts the organization ID from route params, verifies membership,
 * and returns the full organization context.
 *
 * @param req - The incoming request
 * @param organizationId - The organization ID from the URL params
 * @param requiredRoles - Optional: if provided, also checks that the user
 *                        has one of these roles in the organization
 */
export async function getOrgContext(
  req: NextRequest,
  organizationId: string,
  requiredRoles?: MemberRole[]
): Promise<OrganizationContext> {
  const { user } = await getAuthContext(req);

  const member = await requireOrgMembership(organizationId, user.id);

  if (requiredRoles && !requiredRoles.includes(member.role)) {
    throw new TenantAccessError();
  }

  return { user, member, organizationId };
}
