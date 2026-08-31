/**
 * GET   /api/v1/organizations/:organizationId/sales-profile
 * PATCH /api/v1/organizations/:organizationId/sales-profile
 *
 * GET is membership-gated. PATCH is owner/admin only.
 * Missing profile returns empty fields (not 404). Upsert on PATCH.
 */
import { type NextRequest } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody } from "@/lib/api/validate";
import { updateOrganizationSalesProfileSchema } from "@/modules/organizations/sales-profile-schema";
import {
  getOrganizationSalesProfile,
  upsertOrganizationSalesProfile,
} from "@/modules/organizations/sales-profile";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);
    const profile = await getOrganizationSalesProfile(organizationId, user.id);
    return successResponse(profile);
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId, [
      "owner",
      "admin",
    ]);
    const body = await validateBody(req, updateOrganizationSalesProfileSchema);
    const profile = await upsertOrganizationSalesProfile(
      organizationId,
      user.id,
      body
    );
    return successResponse(profile);
  });
}
