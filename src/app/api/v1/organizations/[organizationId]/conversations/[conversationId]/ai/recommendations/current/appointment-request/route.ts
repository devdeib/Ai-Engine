/**
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/ai/recommendations/current/appointment-request
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createAppointmentToolInputSchema } from "@/modules/ai/tools/write-schemas";
import { requestAppointmentHitlFromRecommendation } from "@/modules/ai/recommendation/appointment-request";

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
});

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
    const body = await validateBody(req, createAppointmentToolInputSchema);

    const action = await requestAppointmentHitlFromRecommendation({
      organizationId,
      userId: user.id,
      conversationId,
      payload: body,
    });

    return successResponse(action, { status: 201 });
  });
}
