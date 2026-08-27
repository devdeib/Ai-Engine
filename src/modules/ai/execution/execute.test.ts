/**
 * Phase 4.8 execution-gate tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import { AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE } from "@/modules/ai/execution/constants";
import { followUpDueAtFromInbound } from "@/modules/ai/execution/payload";

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/conversations/queries", () => ({
  getConversation: vi.fn(),
  listRecentConversationMessages: vi.fn(),
}));
vi.mock("@/modules/leads/queries", () => ({
  getLead: vi.fn(),
}));
vi.mock("@/modules/ai/pipeline", () => ({
  buildPipelineSnapshot: vi.fn(),
}));
vi.mock("@/modules/ai/actions/write", () => ({
  executeCreateFollowUp: vi.fn(),
  requestCreateAppointment: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  escalateToHuman: vi.fn(),
  pauseAI: vi.fn(),
  resumeAI: vi.fn(),
}));
vi.mock("@/modules/ai/execution/queries", () => ({
  loadRecommendationByInbound: vi.fn(),
  hasInboundFollowUpAction: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import {
  executeCreateFollowUp,
  requestCreateAppointment,
} from "@/modules/ai/actions/write";
import { escalateToHuman } from "@/modules/ai/handoff";
import {
  hasInboundFollowUpAction,
  loadRecommendationByInbound,
} from "@/modules/ai/execution/queries";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import type { ConversationWithLead, Lead, Message } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const INBOUND_AT = "2026-08-21T10:00:00Z";

const pipeline: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: INBOUND_AT,
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
};

const followUpAnalysis: AiSalesAnalysisPayload = {
  inboundIntent: "general_question",
  objection: "none",
  urgency: "medium",
  qualification: "qualifying",
  inferredStage: "qualifying",
  buyingSignals: ["mentioning_timeline"],
  missingInformation: [],
  nextBestAction: "create_follow_up",
  rationale: "Customer asked for a callback later.",
  confidence: 0.8,
};

const conversation: ConversationWithLead = {
  id: CONV_1,
  organization_id: ORG_A,
  lead_id: LEAD_1,
  channel: "in_app",
  status: "open",
  requires_human: false,
  ai_paused_at: null,
  channel_account_id: null,
  channel_identity_id: null,
  created_at: "2026-08-20T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
  lead: { id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: null },
};

const lead = {
  id: LEAD_1,
  organization_id: ORG_A,
  first_name: "Ahmed",
  last_name: "Ali",
  email: null,
  phone: null,
  company_name: null,
  status: "new",
  score: null,
  notes: null,
} as Lead;

const inboundMessage: Message = {
  id: INBOUND,
  organization_id: ORG_A,
  conversation_id: CONV_1,
  author_user_id: USER_1,
  author_type: "human",
  direction: "inbound",
  body: "Can you follow up tomorrow?",
  in_reply_to_message_id: null,
  channel_identity_id: null,
  created_at: INBOUND_AT,
};

function recommendation(
  overrides: Partial<AiSalesRecommendation> = {}
): AiSalesRecommendation {
  return {
    id: "rec-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    inbound_message_created_at: INBOUND_AT,
    analysis_id: "ana-1",
    policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
    status: "recorded",
    recommended_action: "suggest_follow_up",
    cited_analysis_action: "create_follow_up",
    requires_human_approval: false,
    mapped_tool_name: "create_follow_up",
    reason_codes: ["cited_model_action"],
    pipeline_snapshot: { ...pipeline },
    error_code: null,
    requested_by_user_id: USER_1,
    trigger_source: "operator",
    channel_identity_id: null,
    created_at: "2026-08-21T10:01:00Z",
    updated_at: "2026-08-21T10:01:00Z",
    ...overrides,
  };
}

const gateInput = {
  organizationId: ORG_A,
  userId: USER_1,
  triggerSource: "operator" as const,
  channelIdentityId: null,
  conversationId: CONV_1,
  leadId: LEAD_1,
  inboundMessageId: INBOUND,
  analysisPayload: followUpAnalysis,
};

describe("executeFromRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inboundMessage]);
    vi.mocked(getLead).mockResolvedValue(lead);
    vi.mocked(buildPipelineSnapshot).mockResolvedValue(pipeline);
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(recommendation());
    vi.mocked(hasInboundFollowUpAction).mockResolvedValue(false);
    vi.mocked(executeCreateFollowUp).mockResolvedValue({
      status: "created",
      title: AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE,
      dueAt: followUpDueAtFromInbound(INBOUND_AT),
    });
  });

  it("executes suggest_follow_up exactly once with the server-owned payload", async () => {
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({ outcome: "executed" });
    expect(executeCreateFollowUp).toHaveBeenCalledTimes(1);
    expect(executeCreateFollowUp).toHaveBeenCalledWith(
      {
        organizationId: ORG_A,
        userId: USER_1,
        triggerSource: "operator",
        channelIdentityId: null,
        conversationId: CONV_1,
        leadId: LEAD_1,
        inboundMessageId: INBOUND,
      },
      {
        title: "Follow up",
        notes: null,
        dueAt: "2026-08-22T10:00:00.000Z",
      }
    );
    expect(requestCreateAppointment).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(executeCreateFollowUp).mock.calls[0]?.[1])).not.toContain(
      followUpAnalysis.rationale
    );
  });

  it("replays the same inbound without a second follow-up", async () => {
    await executeFromRecommendation(gateInput);
    vi.mocked(hasInboundFollowUpAction).mockResolvedValue(true);
    const second = await executeFromRecommendation(gateInput);
    expect(second).toEqual({
      outcome: "skipped",
      reason: "already_has_tool_action",
    });
    expect(executeCreateFollowUp).toHaveBeenCalledTimes(1);
  });

  it("skips when the model already created a follow-up for this inbound", async () => {
    vi.mocked(hasInboundFollowUpAction).mockResolvedValue(true);
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "already_has_tool_action",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips when a pending CRM follow-up already exists", async () => {
    vi.mocked(buildPipelineSnapshot).mockResolvedValue({
      ...pipeline,
      hasPendingFollowUp: true,
    });
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "already_has_pending_follow_up",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips a closed conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({ outcome: "skipped", reason: "closed" });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips a paused conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      ai_paused_at: "2026-08-21T10:05:00Z",
    });
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "conversation_paused",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips when the conversation requires a human", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "requires_human",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips a failed recommendation", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({ status: "failed", error_code: "AI_RECOMMENDATION_FAILED" })
    );
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "failed_recommendation",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips the wrong policy version", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({ policy_version: "AI_SALES_RECOMMENDATION_POLICY_V0" })
    );
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "unsupported_policy",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips when no recommendation exists", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(null);
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "recommendation_unavailable",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips when persisted identity does not match the trusted turn", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({ lead_id: "99999999-9999-4999-8999-999999999999" })
    );
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "identity_mismatch",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("skips when the live policy no longer matches the persisted recommendation", async () => {
    const result = await executeFromRecommendation({
      ...gateInput,
      analysisPayload: {
        ...followUpAnalysis,
        nextBestAction: "provide_information",
      },
    });
    expect(result).toEqual({
      outcome: "skipped",
      reason: "policy_mismatch",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("never creates an appointment for suggest_appointment_approval", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({
        recommended_action: "suggest_appointment_approval",
        cited_analysis_action: "request_appointment_approval",
        mapped_tool_name: "create_appointment",
        requires_human_approval: true,
      })
    );
    const result = await executeFromRecommendation({
      ...gateInput,
      analysisPayload: {
        ...followUpAnalysis,
        nextBestAction: "request_appointment_approval",
      },
    });
    expect(result).toEqual({
      outcome: "skipped",
      reason: "not_executable",
    });
    expect(requestCreateAppointment).not.toHaveBeenCalled();
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("never escalates for suggest_human_handoff", async () => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({
        recommended_action: "suggest_human_handoff",
        cited_analysis_action: "human_handoff",
        mapped_tool_name: null,
        requires_human_approval: false,
      })
    );
    const result = await executeFromRecommendation({
      ...gateInput,
      analysisPayload: {
        ...followUpAnalysis,
        nextBestAction: "human_handoff",
      },
    });
    expect(result).toEqual({
      outcome: "skipped",
      reason: "not_executable",
    });
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it.each([
    ["ask_qualification_question", "ask_qualification_question"],
    ["provide_information", "provide_information"],
    ["wait_for_customer", "wait_for_customer"],
  ] as const)("does not mutate CRM for %s", async (action, cited) => {
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({
        recommended_action: action,
        cited_analysis_action: cited,
        mapped_tool_name: null,
        requires_human_approval: false,
      })
    );
    const result = await executeFromRecommendation({
      ...gateInput,
      analysisPayload: {
        ...followUpAnalysis,
        nextBestAction: cited,
      },
    });
    expect(result).toEqual({
      outcome: "skipped",
      reason: "not_executable",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("does not mutate CRM for defer_existing_control", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    vi.mocked(loadRecommendationByInbound).mockResolvedValue(
      recommendation({
        recommended_action: "defer_existing_control",
        mapped_tool_name: null,
        requires_human_approval: false,
        reason_codes: ["requires_human"],
      })
    );
    const result = await executeFromRecommendation(gateInput);
    expect(result.outcome).toBe("skipped");
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("returns failed when executeCreateFollowUp throws", async () => {
    vi.mocked(executeCreateFollowUp).mockRejectedValue(new Error("insert failed"));
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "failed",
      code: "AI_RECOMMENDATION_EXECUTION_FAILED",
    });
  });

  it("skips a cross-tenant membership failure without CRM mutation", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    const result = await executeFromRecommendation({
      ...gateInput,
      organizationId: ORG_B,
    });
    expect(result).toEqual({
      outcome: "skipped",
      reason: "tenant_mismatch",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(loadRecommendationByInbound).not.toHaveBeenCalled();
  });

  it("skips when the live conversation is not in the trusted organization", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
    const result = await executeFromRecommendation(gateInput);
    expect(result).toEqual({
      outcome: "skipped",
      reason: "tenant_mismatch",
    });
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("requires organization membership before executing", async () => {
    await executeFromRecommendation(gateInput);
    expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
  });
});
