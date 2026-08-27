/**
 * GET /api/v1/organizations/:organizationId/conversations/:conversationId/ai/recommendations/current
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { getCurrentAiSalesRecommendation } from "@/modules/ai/recommendation/queries";
import {
  loadRecommendationPlanContext,
  toPublicRecommendationWithPlan,
} from "@/modules/ai/execution/plan-context";

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

    const [row, planContext] = await Promise.all([
      getCurrentAiSalesRecommendation(organizationId, user.id, conversationId),
      loadRecommendationPlanContext(organizationId, user.id, conversationId),
    ]);

    return successResponse(toPublicRecommendationWithPlan(row, planContext));
  });
}
