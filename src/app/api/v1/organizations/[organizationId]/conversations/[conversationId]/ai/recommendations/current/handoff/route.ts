/**
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/ai/recommendations/current/handoff
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { requestHandoffFromRecommendation } from "@/modules/ai/recommendation/handoff-request";

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
});

const emptyBodySchema = z.object({}).strict();

interface RouteContext {
  params: Promise<{ organizationId: string; conversationId: string }>;
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, conversationId } = await context.params;
    validateParams({ conversationId }, conversationParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    await validateBody(req, emptyBodySchema);

    const conversation = await requestHandoffFromRecommendation({
      organizationId,
      userId: user.id,
      conversationId,
    });

    return successResponse(conversation);
  });
}
