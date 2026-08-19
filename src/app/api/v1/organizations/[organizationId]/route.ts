/**
 * GET  /api/v1/organizations/:organizationId  — Get organization details
 * PATCH /api/v1/organizations/:organizationId  — Update organization
 */
import { type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody } from "@/lib/api/validate";
import {
  getOrganization,
  updateOrganization,
} from "@/modules/organizations/queries";

const updateOrgSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name is too long")
    .optional(),
});

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);
    const org = await getOrganization(organizationId, user.id);
    return successResponse(org);
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId, [
      "owner",
      "admin",
    ]);
    const body = await validateBody(req, updateOrgSchema);

    if (!body.name) {
      const org = await getOrganization(organizationId, user.id);
      return successResponse(org);
    }

    const updated = await updateOrganization(organizationId, user.id, {
      name: body.name,
    });
    return successResponse(updated);
  });
}
