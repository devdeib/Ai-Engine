/**
 * GET /api/v1/organizations/:organizationId/conversations/:conversationId/ai/actions
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listAiToolActionsQuerySchema } from "@/modules/ai/actions/schema";
import { listAiToolActions } from "@/modules/ai/actions/queries";
import { toPublicAiToolAction } from "@/modules/ai/actions/map";

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; conversationId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, conversationId } = await context.params;
    validateParams({ conversationId }, conversationParamsSchema);
    const { user } = await getOrgContext(req, organizationId);

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = validateParams(rawParams, listAiToolActionsQuerySchema);
    const { page, limit, status } = params;

    const actions = await listAiToolActions(
      organizationId,
      user.id,
      { page, limit },
      { status, conversationId }
    );

    return successResponse(actions.map((action) => toPublicAiToolAction(action)), {
      meta: { page, limit, count: actions.length },
    });
  });
}
