/**
 * GET  /api/v1/organizations/:organizationId/conversations
 *      — List conversations (paginated, newest-updated first)
 *
 * POST /api/v1/organizations/:organizationId/conversations
 *      — Create an in-app conversation for a lead
 *
 * organization_id always comes from the verified URL context via getOrgContext.
 * Client bodies cannot supply organization_id, user_id, requires_human, or
 * ai_paused_at.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createConversationSchema } from "@/modules/conversations/schema";
import {
  listConversations,
  type ConversationsFilter,
} from "@/modules/conversations/queries";
import { createConversation } from "@/modules/conversations/actions";

export const CONVERSATION_PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

const listConversationsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(CONVERSATION_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(CONVERSATION_PAGINATION_DEFAULTS.limit),
  status: z.enum(["open", "closed"]).optional(),
  lead_id: z.string().uuid("lead_id must be a valid UUID").optional(),
});

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
    const params = validateParams(rawParams, listConversationsQuerySchema);
    const { page, limit, status, lead_id } = params;

    const filter: ConversationsFilter = {};
    if (status) filter.status = status;
    if (lead_id) filter.leadId = lead_id;

    const conversations = await listConversations(
      organizationId,
      user.id,
      { page, limit },
      filter
    );

    return successResponse(conversations, {
      meta: { page, limit, count: conversations.length },
    });
  });
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId } = await context.params;
    const { user } = await getOrgContext(req, organizationId);

    const body = await validateBody(req, createConversationSchema);
    const conversation = await createConversation(organizationId, user.id, body);
    return successResponse(conversation, { status: 201 });
  });
}
