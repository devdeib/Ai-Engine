/**
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/ai/process
 *
 * Runs deterministic eligibility then, if allowed, generates an AI reply.
 * Identity is taken from the session and URL — never from the body.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { processConversationMessage } from "@/modules/ai/service";

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

    const result = await processConversationMessage(
      organizationId,
      conversationId,
      { kind: "operator", userId: user.id }
    );

    return successResponse(result);
  });
}
