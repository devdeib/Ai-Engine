import "server-only";
import { requestCreateAppointment } from "@/modules/ai/actions/write";
import type { AiToolDefinition } from "@/modules/ai/tools/types";
import {
  CREATE_APPOINTMENT_JSON_SCHEMA,
  createAppointmentToolInputSchema,
  createAppointmentToolOutputSchema,
  type CreateAppointmentToolInput,
} from "@/modules/ai/tools/write-schemas";

export const createAppointmentTool: AiToolDefinition = {
  name: "create_appointment",
  trust: "human_approval",
  description:
    "Request a viewing/appointment for the current lead. A human must approve before it is created. This does not book or confirm anything. Scope is fixed by the server.",
  inputSchema: createAppointmentToolInputSchema,
  outputSchema: createAppointmentToolOutputSchema,
  inputJsonSchema: { ...CREATE_APPOINTMENT_JSON_SCHEMA },
  async execute(ctx, input) {
    return requestCreateAppointment(ctx, input as CreateAppointmentToolInput);
  },
};
