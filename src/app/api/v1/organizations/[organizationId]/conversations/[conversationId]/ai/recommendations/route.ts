/**
 * GET /api/v1/organizations/:organizationId/conversations/:conversationId/ai/recommendations
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listAiSalesRecommendationsQuerySchema } from "@/modules/ai/recommendation/schema";
import { listAiSalesRecommendations } from "@/modules/ai/recommendation/queries";
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

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = validateParams(rawParams, listAiSalesRecommendationsQuerySchema);
    const { page, limit } = params;

    const [rows, planContext] = await Promise.all([
      listAiSalesRecommendations(organizationId, user.id, conversationId, {
        page,
        limit,
      }),
      loadRecommendationPlanContext(organizationId, user.id, conversationId),
    ]);

    return successResponse(
      rows.map((row) => toPublicRecommendationWithPlan(row, planContext)),
      { meta: { page, limit, count: rows.length } }
    );
  });
}
