/**
 * POST /api/v1/organizations/:organizationId/ai/actions/:actionId/approve
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { approveAiToolActionSchema } from "@/modules/ai/actions/schema";
import { approveAiToolAction } from "@/modules/ai/actions/write";
import { getAiToolAction } from "@/modules/ai/actions/queries";
import { toPublicAiToolAction } from "@/modules/ai/actions/map";

const actionParamsSchema = z.object({
  actionId: z.string().uuid("Action ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; actionId: string }>;
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, actionId } = await context.params;
    validateParams({ actionId }, actionParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    await validateBody(req, approveAiToolActionSchema);

    await approveAiToolAction(organizationId, user.id, actionId);
    const action = await getAiToolAction(organizationId, user.id, actionId);
    return successResponse(toPublicAiToolAction(action));
  });
}
