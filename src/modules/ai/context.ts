/**
 * Builds tenant-scoped CRM context for the AI. Never dumps the whole database.
 * IDs and secrets are omitted from the prompt-facing shape.
 *
 * Accepts optional pre-loaded conversation and messages so the service layer
 * can avoid redundant database round-trips that have already been performed
 * for eligibility checks. The pipeline snapshot is deferred (set to a
 * zero-value placeholder) because the LLM prompt destructures it out and
 * the service rebuilds it after the AI response when it is actually needed.
 */
import "server-only";
import type { ConversationWithLead, Message } from "@/lib/db/types";
import { getOrganization, getOrganizationName } from "@/modules/organizations/queries";
import { getOrganizationSalesProfile } from "@/modules/organizations/sales-profile";
import { getLead } from "@/modules/leads/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { listLeadActivities } from "@/modules/leads/activities/queries";
import {
  AI_CONTEXT_MESSAGE_LIMIT,
  AI_CONTEXT_SIDE_LIMIT,
  type AiContext,
  type AiMessageContext,
  type AiPipelineSnapshot,
  type AiSalesProfileContext,
} from "@/modules/ai/types";
import { mapAuthorTypeForAiContext } from "@/modules/ai/principal";
import type { OrganizationSalesProfilePublic } from "@/modules/organizations/sales-profile-schema";
import { buildLeadQualificationView } from "@/modules/leads/qualification";

function toAiSalesProfile(
  profile: OrganizationSalesProfilePublic
): AiSalesProfileContext {
  return {
    offeringSummary: profile.offering_summary,
    serviceArea: profile.service_area,
    qualificationCriteria: profile.qualification_criteria,
    constraints: profile.constraints,
    typicalNextStep: profile.typical_next_step,
  };
}

export function toAiMessageContext(message: Message): AiMessageContext {
  return {
    direction: message.direction,
    authorType: mapAuthorTypeForAiContext(message.author_type),
    body: message.body,
    createdAt: message.created_at,
  };
}

function selectLatestCustomerMessage(
  messages: Message[],
  inboundMessageId?: string
): AiMessageContext | null {
  const selected = inboundMessageId
    ? messages.find((message) => message.id === inboundMessageId)
    : [...messages].reverse().find((message) => message.direction === "inbound");
  if (!selected || selected.direction !== "inbound") {
    return null;
  }
  return toAiMessageContext(selected);
}

/**
 * Placeholder pipeline snapshot. The LLM prompt destructures pipeline out
 * (`const { pipeline: _pipeline, ...untrusted } = context`), so it is never
 * sent to OpenAI. The service layer rebuilds it after the AI response when
 * it is actually needed for advisory analysis and recommendations.
 */
const DEFERRED_PIPELINE_SNAPSHOT: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: null,
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
};

export async function buildAiContext(input: {
  organizationId: string;
  userId: string | null;
  conversationId: string;
  inboundMessageId?: string;
  /** Pre-loaded conversation — avoids a redundant getConversation() call. */
  preloadedConversation?: ConversationWithLead;
  /** Pre-loaded messages — avoids a redundant listRecentConversationMessages() call. */
  preloadedMessages?: Message[];
}): Promise<AiContext> {
  const conversation =
    input.preloadedConversation ??
    (await getConversation(
      input.organizationId,
      input.userId,
      input.conversationId
    ));

  const needsMessages = !input.preloadedMessages;

  const [
    organizationName,
    salesProfile,
    lead,
    loadedMessages,
    followUps,
    appointments,
    activities,
  ] = await Promise.all([
    input.userId
      ? getOrganization(input.organizationId, input.userId).then(
          (organization) => organization.name
        )
      : getOrganizationName(input.organizationId),
    getOrganizationSalesProfile(input.organizationId, input.userId),
    getLead(conversation.lead_id, input.organizationId, input.userId),
    needsMessages
      ? listRecentConversationMessages(
          input.organizationId,
          input.userId,
          input.conversationId,
          AI_CONTEXT_MESSAGE_LIMIT
        )
      : Promise.resolve(null),
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

  const msgList = input.preloadedMessages ?? loadedMessages ?? [];

  const qualification = buildLeadQualificationView({
    email: lead.email,
    phone: lead.phone,
    qualificationFacts: lead.qualification_facts,
  });

  return {
    organization: {
      name: organizationName,
      salesProfile: toAiSalesProfile(salesProfile),
    },
    lead: {
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
    },
    conversation: {
      channel: conversation.channel,
      status: conversation.status,
      requiresHuman: conversation.requires_human,
      aiPausedAt: conversation.ai_paused_at,
    },
    messages: msgList.map(toAiMessageContext),
    latestCustomerMessage: selectLatestCustomerMessage(
      msgList,
      input.inboundMessageId
    ),
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
    pipeline: DEFERRED_PIPELINE_SNAPSHOT,
  };
}
