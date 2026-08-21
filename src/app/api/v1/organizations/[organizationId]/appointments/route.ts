/**
 * GET /api/v1/organizations/:organizationId/appointments
 *     — Organization-wide appointment queue (paginated)
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateParams } from "@/lib/api/validate";
import {
  appointmentStatusSchema,
  appointmentTimestampSchema,
} from "@/modules/appointments/schema";
import {
  listAppointments,
  type AppointmentsFilter,
} from "@/modules/appointments/queries";

export const APPOINTMENT_QUEUE_PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
} as const;

const listQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(APPOINTMENT_QUEUE_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(APPOINTMENT_QUEUE_PAGINATION_DEFAULTS.limit),
  status: appointmentStatusSchema.optional(),
  assigned_user_id: z
    .union([
      z.literal("unassigned"),
      z.string().uuid("assigned_user_id must be a valid UUID"),
    ])
    .optional(),
  lead_id: z.string().uuid("lead_id must be a valid UUID").optional(),
  from: appointmentTimestampSchema.optional(),
  to: appointmentTimestampSchema.optional(),
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
    const params = validateParams(rawParams, listQuerySchema);
    const { page, limit, status, assigned_user_id, lead_id, from, to } = params;

    const filter: AppointmentsFilter = {};
    if (status) filter.status = status;
    if (assigned_user_id) filter.assignedUserId = assigned_user_id;
    if (lead_id) filter.leadId = lead_id;
    if (from) filter.from = from;
    if (to) filter.to = to;

    const appointments = await listAppointments(
      organizationId,
      user.id,
      { page, limit },
      filter
    );

    return successResponse(appointments, {
      meta: { page, limit, count: appointments.length },
    });
  });
}
