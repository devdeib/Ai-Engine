/**
 * GET /api/v1/organizations/:organizationId/members
 * Returns all members of an organization.
 */
import { type NextRequest } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { getOrganizationMembers } from "@/modules/organizations/queries";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);
    const members = await getOrganizationMembers(organizationId, user.id);
    return successResponse(members, {
      meta: { count: members.length },
    });
  });
}
