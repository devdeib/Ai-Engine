/**
 * GET /api/v1/organizations/:organizationId/ai/action-center
 * Read-only operator discovery. No mutations.
 */
import { type NextRequest, NextResponse } from "next/server";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { listAiActionCenterQuerySchema } from "@/modules/ai/action-center/schema";
import { getAiActionCenter } from "@/modules/ai/action-center/service";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);

    const rawParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const params = validateParams(rawParams, listAiActionCenterQuerySchema);
    const { page, limit } = params;

    const result = await getAiActionCenter(organizationId, user.id, {
      page,
      limit,
    });

    return successResponse(result, {
      meta: {
        page,
        limit,
        pendingCount: result.pendingActions.length,
        recommendationCount: result.recommendationItems.length,
      },
    });
  });
}
