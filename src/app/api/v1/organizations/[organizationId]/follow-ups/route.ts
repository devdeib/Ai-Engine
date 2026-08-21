/**
 * GET /api/v1/organizations/:organizationId/follow-ups
 *     — Organization-wide follow-up queue (paginated)
 *
 * Filters: status, assigned_user_id ("unassigned" or UUID), lead_id, overdue.
 * Overdue is derived: pending AND due_at < now. It is never a stored status.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import { leadFollowUpStatusSchema } from "@/modules/follow-ups/schema";
import {
  listFollowUps,
  type FollowUpsFilter,
} from "@/modules/follow-ups/queries";

export const FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
} as const;

const listFollowUpsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS.limit),
  status: leadFollowUpStatusSchema.optional(),
  assigned_user_id: z
    .union([
      z.literal("unassigned"),
      z.string().uuid("assigned_user_id must be a valid UUID"),
    ])
    .optional(),
  lead_id: z.string().uuid("lead_id must be a valid UUID").optional(),
  overdue: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
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
    const params = validateParams(rawParams, listFollowUpsQuerySchema);
    const { page, limit, status, assigned_user_id, lead_id, overdue } = params;

    const filter: FollowUpsFilter = {};
    if (status) filter.status = status;
    if (assigned_user_id) filter.assignedUserId = assigned_user_id;
    if (lead_id) filter.leadId = lead_id;
    if (overdue) filter.overdue = true;

    const followUps = await listFollowUps(
      organizationId,
      user.id,
      { page, limit },
      filter
    );

    return successResponse(followUps, {
      meta: { page, limit, count: followUps.length },
    });
  });
}
