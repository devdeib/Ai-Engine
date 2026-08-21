/**
 * GET  /api/v1/organizations/:organizationId/leads/:leadId/follow-ups
 *      — List follow-ups for a lead (paginated)
 *
 * POST /api/v1/organizations/:organizationId/leads/:leadId/follow-ups
 *      — Create a follow-up for the lead
 *
 * organization_id always comes from the verified URL context.
 * lead_id always comes from the URL path.
 * assigned_user_id is the only identity field the client may request.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createFollowUpSchema } from "@/modules/follow-ups/schema";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { createLeadFollowUp } from "@/modules/follow-ups/actions";

export const FOLLOW_UP_PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

const leadParamsSchema = z.object({
  leadId: z.string().uuid("Lead ID must be a valid UUID"),
});

const listFollowUpsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(FOLLOW_UP_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(FOLLOW_UP_PAGINATION_DEFAULTS.limit),
});

interface RouteContext {
  params: Promise<{ organizationId: string; leadId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ leadId }, leadParamsSchema);

    const { user } = await getOrgContext(req, organizationId);

    const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
    const { page, limit } = validateParams(rawQuery, listFollowUpsQuerySchema);

    const followUps = await listLeadFollowUps(
      organizationId,
      user.id,
      leadId,
      { page, limit }
    );

    return successResponse(followUps, {
      meta: { page, limit, count: followUps.length },
    });
  });
}

export async function POST(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, leadId } = await context.params;
    validateParams({ leadId }, leadParamsSchema);

    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, createFollowUpSchema);

    const followUp = await createLeadFollowUp(
      organizationId,
      user.id,
      leadId,
      body
    );

    return successResponse(followUp, { status: 201 });
  });
}
