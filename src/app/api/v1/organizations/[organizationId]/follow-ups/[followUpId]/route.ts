/**
 * PATCH /api/v1/organizations/:organizationId/follow-ups/:followUpId
 *
 * Updates a pending follow-up: title, notes, due_at, assigned_user_id,
 * and/or status (completed | cancelled only).
 *
 * organization_id always comes from the verified URL context.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { updateFollowUpSchema } from "@/modules/follow-ups/schema";
import { updateLeadFollowUp } from "@/modules/follow-ups/actions";

const followUpParamsSchema = z.object({
  followUpId: z.string().uuid("Follow-up ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; followUpId: string }>;
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, followUpId } = await context.params;
    validateParams({ followUpId }, followUpParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, updateFollowUpSchema);

    const followUp = await updateLeadFollowUp(
      organizationId,
      user.id,
      followUpId,
      body
    );

    return successResponse(followUp);
  });
}
