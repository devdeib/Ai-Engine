/**
 * PATCH /api/v1/organizations/:organizationId/leads/:leadId/qualification-facts
 *      — Merge-patch allowlisted qualification facts on a lead
 *
 * Operator-only. Does not go through updateLead() or the AI tool loop.
 * organization_id and user_id come from the verified session and URL.
 */
import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { operatorQualificationFactsSchema } from "@/modules/leads/qualification-schema";
import { applyOperatorQualificationFacts } from "@/modules/leads/qualification-write";

const leadParamsSchema = z.object({
  organizationId: z.string().uuid("Organization ID must be a valid UUID"),
  leadId: z.string().uuid("Lead ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; leadId: string }>;
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ organizationId, leadId }, leadParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, operatorQualificationFactsSchema);
    const lead = await applyOperatorQualificationFacts(
      organizationId,
      user.id,
      leadId,
      body.facts
    );

    return successResponse(lead);
  });
}
