import { AI_TOOL_NAMES, type AiToolDescriptor, type AiToolName } from "@/modules/ai/types";
import { getLeadContextTool } from "@/modules/ai/tools/get-lead-context";
import { getConversationHistoryTool } from "@/modules/ai/tools/get-conversation-history";
import { getLeadAppointmentsTool } from "@/modules/ai/tools/get-lead-appointments";
import { getLeadFollowUpsTool } from "@/modules/ai/tools/get-lead-follow-ups";
import { createFollowUpTool } from "@/modules/ai/tools/create-follow-up";
import { createAppointmentTool } from "@/modules/ai/tools/create-appointment";
import { recordCustomerFactsTool } from "@/modules/ai/tools/record-customer-facts";
import type { AiToolDefinition } from "@/modules/ai/tools/types";

const tools = [
  getLeadContextTool,
  getConversationHistoryTool,
  getLeadAppointmentsTool,
  getLeadFollowUpsTool,
  createFollowUpTool,
  createAppointmentTool,
  recordCustomerFactsTool,
] as const satisfies readonly AiToolDefinition[];

const toolByName = new Map<string, AiToolDefinition>(
  tools.map((tool) => [tool.name, tool])
);

export function getRegisteredAiToolNames(): readonly AiToolName[] {
  return AI_TOOL_NAMES;
}

export function getAiTool(name: string): AiToolDefinition | undefined {
  return toolByName.get(name);
}

export function listAiToolDescriptors(): AiToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputJsonSchema: tool.inputJsonSchema,
  }));
}
