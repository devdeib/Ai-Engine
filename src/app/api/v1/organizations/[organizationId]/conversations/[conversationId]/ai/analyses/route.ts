/**
 * GET /api/v1/organizations/:organizationId/conversations/:conversationId/ai/analyses
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listAiSalesAnalysesQuerySchema } from "@/modules/ai/analysis/schema";
import {
  getLatestInboundMessageId,
  listAiSalesAnalyses,
} from "@/modules/ai/analysis/queries";
import { toPublicAiSalesAnalysis } from "@/modules/ai/analysis/map";

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
    const params = validateParams(rawParams, listAiSalesAnalysesQuerySchema);
    const { page, limit } = params;

    const [rows, latestInboundId] = await Promise.all([
      listAiSalesAnalyses(organizationId, user.id, conversationId, {
        page,
        limit,
      }),
      getLatestInboundMessageId(organizationId, conversationId),
    ]);

    return successResponse(
      rows.map((row) => toPublicAiSalesAnalysis(row, latestInboundId)),
      { meta: { page, limit, count: rows.length } }
    );
  });
}
