/**
 * GET  /api/v1/organizations/:organizationId/leads/:leadId/appointments
 * POST /api/v1/organizations/:organizationId/leads/:leadId/appointments
 *
 * organization_id always comes from the verified URL context.
 * lead_id always comes from the URL path.
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { createAppointmentSchema } from "@/modules/appointments/schema";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { createAppointment } from "@/modules/appointments/actions";

export const APPOINTMENT_PAGINATION_DEFAULTS = { page: 1, limit: 20 } as const;

const leadParamsSchema = z.object({
  leadId: z.string().uuid("Lead ID must be a valid UUID"),
});

const listQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be an integer")
    .min(1, "Page must be at least 1")
    .default(APPOINTMENT_PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int("Limit must be an integer")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(APPOINTMENT_PAGINATION_DEFAULTS.limit),
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
    const { page, limit } = validateParams(rawQuery, listQuerySchema);

    const appointments = await listLeadAppointments(
      organizationId,
      user.id,
      leadId,
      { page, limit }
    );

    return successResponse(appointments, {
      meta: { page, limit, count: appointments.length },
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
    const body = await validateBody(req, createAppointmentSchema);

    const appointment = await createAppointment(
      organizationId,
      user.id,
      leadId,
      body
    );

    return successResponse(appointment, { status: 201 });
  });
}
