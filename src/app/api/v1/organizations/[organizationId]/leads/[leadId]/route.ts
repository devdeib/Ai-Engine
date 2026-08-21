/**
 * GET    /api/v1/organizations/:organizationId/leads/:leadId  — Get a lead
 * PATCH  /api/v1/organizations/:organizationId/leads/:leadId  — Update a lead
 * DELETE /api/v1/organizations/:organizationId/leads/:leadId  — Delete a lead
 *
 * Lead ID is validated as a UUID before any DB call.  An invalid UUID returns
 * 422.  A valid UUID that belongs to another org returns 404 (no info leakage).
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { updateLeadSchema } from "@/modules/leads/schema";
import { getLead } from "@/modules/leads/queries";
import { updateLead, deleteLead } from "@/modules/leads/actions";

const leadParamsSchema = z.object({
  leadId: z.string().uuid("Lead ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; leadId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ leadId }, leadParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    const lead = await getLead(leadId, organizationId, user.id);
    return successResponse(lead);
  });
}

export async function PATCH(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ leadId }, leadParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    // updateLeadSchema is a partial of createLeadSchema — organization_id is
    // absent from both schemas, so it cannot appear in the parsed payload.
    const body = await validateBody(req, updateLeadSchema);
    const lead = await updateLead(leadId, organizationId, user.id, body);
    return successResponse(lead);
  });
}

export async function DELETE(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ leadId }, leadParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    await deleteLead(leadId, organizationId, user.id);
    return new NextResponse(null, { status: 204 });
  });
}
