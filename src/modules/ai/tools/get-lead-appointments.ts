import "server-only";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { AI_CONTEXT_SIDE_LIMIT } from "@/modules/ai/types";
import {
  asEmptyInputTool,
  leadAppointmentsToolOutputSchema,
} from "@/modules/ai/tools/schemas";
import type { AiToolDefinition } from "@/modules/ai/tools/types";

export const getLeadAppointmentsTool: AiToolDefinition = asEmptyInputTool({
  name: "get_lead_appointments",
  description:
    "Read existing appointments for the current lead. Scope is fixed by the server.",
  outputSchema: leadAppointmentsToolOutputSchema,
  async execute(ctx) {
    const appointments = await listLeadAppointments(
      ctx.organizationId,
      ctx.userId,
      ctx.leadId,
      { page: 1, limit: AI_CONTEXT_SIDE_LIMIT }
    );
    return {
      appointments: appointments.map((item) => ({
        status: item.status,
        startsAt: item.starts_at,
        location: item.location,
      })),
    };
  },
});
