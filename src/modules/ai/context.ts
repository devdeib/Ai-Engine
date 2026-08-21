/**
 * Builds tenant-scoped CRM context for the AI. Never dumps the whole database.
 * IDs and secrets are omitted from the prompt-facing shape.
 */
import "server-only";
import { getOrganization } from "@/modules/organizations/queries";
import { getLead } from "@/modules/leads/queries";
import { getConversation } from "@/modules/conversations/queries";
import { listRecentConversationMessages } from "@/modules/conversations/queries";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { listLeadActivities } from "@/modules/leads/activities/queries";
import {
  AI_CONTEXT_MESSAGE_LIMIT,
  AI_CONTEXT_SIDE_LIMIT,
  type AiContext,
} from "@/modules/ai/types";

export async function buildAiContext(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
}): Promise<AiContext> {
  const conversation = await getConversation(
    input.organizationId,
    input.userId,
    input.conversationId
  );

  const [organization, lead, messages, followUps, appointments, activities] =
    await Promise.all([
      getOrganization(input.organizationId, input.userId),
      getLead(conversation.lead_id, input.organizationId, input.userId),
      listRecentConversationMessages(
        input.organizationId,
        input.userId,
        input.conversationId,
        AI_CONTEXT_MESSAGE_LIMIT
      ),
      listLeadFollowUps(
        input.organizationId,
        input.userId,
        conversation.lead_id,
        { page: 1, limit: AI_CONTEXT_SIDE_LIMIT }
      ),
      listLeadAppointments(
        input.organizationId,
        input.userId,
        conversation.lead_id,
        { page: 1, limit: AI_CONTEXT_SIDE_LIMIT }
      ),
      listLeadActivities(
        input.organizationId,
        input.userId,
        conversation.lead_id,
        { page: 1, limit: AI_CONTEXT_SIDE_LIMIT }
      ),
    ]);

  return {
    organization: { name: organization.name },
    lead: {
      firstName: lead.first_name,
      lastName: lead.last_name,
      companyName: lead.company_name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      score: lead.score,
      notes: lead.notes,
    },
    conversation: {
      channel: conversation.channel,
      status: conversation.status,
      requiresHuman: conversation.requires_human,
      aiPausedAt: conversation.ai_paused_at,
    },
    messages: messages.map((message) => ({
      direction: message.direction,
      authorType: message.author_type,
      body: message.body,
      createdAt: message.created_at,
    })),
    followUps: followUps.map((item) => ({
      title: item.title,
      status: item.status,
      dueAt: item.due_at,
    })),
    appointments: appointments.map((item) => ({
      status: item.status,
      startsAt: item.starts_at,
      location: item.location,
    })),
    recentActivities: activities.map((item) => ({
      type: item.type,
      content: item.content,
      createdAt: item.created_at,
    })),
  };
}
