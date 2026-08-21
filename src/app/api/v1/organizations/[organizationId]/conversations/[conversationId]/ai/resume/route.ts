/**
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/ai/resume
 *
 * Returns the thread to AI: clears ai_paused_at and requires_human.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { resumeAI } from "@/modules/ai/handoff";

const paramsSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
});

const bodySchema = z.object({});

interface RouteContext {
  params: Promise<{ organizationId: string; conversationId: string }>;
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, conversationId } = await context.params;
    validateParams({ conversationId }, paramsSchema);
    const { user } = await getOrgContext(req, organizationId);
    await validateBody(req, bodySchema);
    const conversation = await resumeAI(organizationId, user.id, conversationId);
    return successResponse(conversation);
  });
}
