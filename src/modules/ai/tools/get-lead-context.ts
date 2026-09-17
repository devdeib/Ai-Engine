import "server-only";
import { getLead } from "@/modules/leads/queries";
import { asEmptyInputTool, leadContextToolOutputSchema } from "@/modules/ai/tools/schemas";
import type { AiToolDefinition } from "@/modules/ai/tools/types";
import { buildLeadQualificationView } from "@/modules/leads/qualification";

export const getLeadContextTool: AiToolDefinition = asEmptyInputTool({
  name: "get_lead_context",
  description:
    "Read the current lead's CRM profile for this conversation. Scope is fixed by the server.",
  outputSchema: leadContextToolOutputSchema,
  async execute(ctx) {
    const lead = await getLead(ctx.leadId, ctx.organizationId, ctx.userId);
    const qualification = buildLeadQualificationView({
      email: lead.email,
      phone: lead.phone,
      qualificationFacts: lead.qualification_facts,
    });
    return {
      firstName: lead.first_name,
      lastName: lead.last_name,
      companyName: lead.company_name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      score: lead.score,
      notes: lead.notes,
      priorQualificationFacts: qualification.facts,
      priorQualificationStatus: qualification.qualificationStatus,
      priorMissingRequiredFields: qualification.missingRequiredFields,
    };
  },
});
