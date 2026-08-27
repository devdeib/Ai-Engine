/**
 * GET /api/v1/organizations/:organizationId/conversations/:conversationId/ai/analyses/current
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
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

    const [row, latestInboundId] = await Promise.all([
      getLatestAiSalesAnalysis(organizationId, user.id, conversationId),
      getLatestInboundMessageId(organizationId, conversationId),
    ]);

    return successResponse(toPublicAiSalesAnalysis(row, latestInboundId));
  });
}
