/**
 * GET   /api/v1/organizations/:organizationId/appointments/:appointmentId
 * PATCH /api/v1/organizations/:organizationId/appointments/:appointmentId
 */
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, successResponse } from "@/lib/api/response";
import { getOrgContext } from "@/lib/api/auth";
import { validateBody, validateParams } from "@/lib/api/validate";
import { updateAppointmentSchema } from "@/modules/appointments/schema";
import { getAppointment } from "@/modules/appointments/queries";
import { updateAppointment } from "@/modules/appointments/actions";

const appointmentParamsSchema = z.object({
  appointmentId: z.string().uuid("Appointment ID must be a valid UUID"),
});

interface RouteContext {
  params: Promise<{ organizationId: string; appointmentId: string }>;
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, appointmentId } = await context.params;
    validateParams({ appointmentId }, appointmentParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    const appointment = await getAppointment(
      organizationId,
      user.id,
      appointmentId
    );
    return successResponse(appointment);
  });
}

export async function PATCH(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  return handleApiError(async () => {
    const { organizationId, appointmentId } = await context.params;
    validateParams({ appointmentId }, appointmentParamsSchema);
    const { user } = await getOrgContext(req, organizationId);
    const body = await validateBody(req, updateAppointmentSchema);
    const appointment = await updateAppointment(
      organizationId,
      user.id,
      appointmentId,
      body
    );
    return successResponse(appointment);
  });
}
