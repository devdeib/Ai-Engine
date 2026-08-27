/**
 * POST /api/v1/organizations/:organizationId/ai/actions/:actionId/reject
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { rejectAiToolActionSchema } from "@/modules/ai/actions/schema";
import { rejectAiToolAction } from "@/modules/ai/actions/write";
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
    const body = await validateBody(req, rejectAiToolActionSchema);

    await rejectAiToolAction(organizationId, user.id, actionId, body.reason);
    const action = await getAiToolAction(organizationId, user.id, actionId);
    return successResponse(toPublicAiToolAction(action));
  });
}
