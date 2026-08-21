/**
 * GET  /api/v1/organizations/:organizationId/conversations/:conversationId/messages
 *      — List messages (paginated, oldest → newest)
 *
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/messages
 *      — Append a human-authored message
 *
 * organization_id, conversation_id, and author_user_id are never accepted
 * from the request body.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createMessageSchema } from "@/modules/conversations/schema";
import { listConversationMessages } from "@/modules/conversations/queries";
import { createConversationMessage } from "@/modules/conversations/actions";

export const MESSAGE_PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid("Conversation ID must be a valid UUID"),
});

const listMessagesQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(MESSAGE_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(MESSAGE_PAGINATION_DEFAULTS.limit),
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

    const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { page, limit } = validateParams(rawQuery, listMessagesQuerySchema);

    const messages = await listConversationMessages(
      organizationId,
      user.id,
      conversationId,
      { page, limit }
    );

    return successResponse(messages, {
      meta: { page, limit, count: messages.length },
    });
  });
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, conversationId } = await context.params;
    validateParams({ conversationId }, conversationParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, createMessageSchema);

    const message = await createConversationMessage(
      organizationId,
      user.id,
      conversationId,
      body
    );

    return successResponse(message, { status: 201 });
  });
}
