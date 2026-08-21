/**
 * GET   /api/v1/organizations/:organizationId/conversations/:conversationId
 * PATCH /api/v1/organizations/:organizationId/conversations/:conversationId
 *
 * PATCH accepts only { status: "open" | "closed" }.
 * Handoff fields (requires_human, ai_paused_at) are not writable.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { updateConversationSchema } from "@/modules/conversations/schema";
import { getConversation } from "@/modules/conversations/queries";
import { updateConversation } from "@/modules/conversations/actions";

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
    const conversation = await getConversation(
      organizationId,
      user.id,
      conversationId
    );
    return successResponse(conversation);
  });
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, conversationId } = await context.params;
    validateParams({ conversationId }, conversationParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, updateConversationSchema);
    const conversation = await updateConversation(
      organizationId,
      user.id,
      conversationId,
      body
    );
    return successResponse(conversation);
  });
}
