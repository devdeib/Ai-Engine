/**
 * GET  /api/v1/organizations/:organizationId/leads/:leadId/activities
 *      — List a lead's activity timeline (paginated, newest-first)
 *
 * POST /api/v1/organizations/:organizationId/leads/:leadId/activities
 *      — Append an activity to the timeline
 *
 * Both endpoints:
 *   1. Authenticate the request (valid session required).
 *   2. Verify the caller is a member of :organizationId.
 *   3. Verify :leadId is a valid UUID (422 otherwise).
 *   4. Delegate to the domain layer which also verifies the lead belongs to
 *      the verified organization (cross-tenant prevention).
 *
 * Neither endpoint accepts organization_id or user_id from the request body.
 * Both are derived exclusively from the server-side session and URL context.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createActivitySchema } from "@/modules/leads/activities/schema";
import {
  listLeadActivities,
  createLeadActivity,
} from "@/modules/leads/activities/queries";

export const ACTIVITY_PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

const leadParamsSchema = z.object({
  leadId: z.string().uuid("Lead ID must be a valid UUID"),
});

const listActivitiesQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(ACTIVITY_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(ACTIVITY_PAGINATION_DEFAULTS.limit),
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
    const { page, limit } = validateParams(rawQuery, listActivitiesQuerySchema);

    const activities = await listLeadActivities(
      organizationId,
      user.id,
      leadId,
      { page, limit }
    );

    return successResponse(activities, {
      meta: { page, limit, count: activities.length },
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

    // createActivitySchema only accepts type + content.
    // organization_id, lead_id, and user_id cannot be supplied by the caller.
    const body = await validateBody(req, createActivitySchema);

    const activity = await createLeadActivity(
      organizationId,
      user.id,
      leadId,
      body
    );

    return successResponse(activity, { status: 201 });
  });
}
