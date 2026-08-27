/**
 * Phase 4.11 recommendation → operator-confirmed handoff. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError, TenantAccessError } from "@/lib/errors";
import type { AiSalesRecommendation, ConversationWithLead, Lead, Message } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";

vi.mock("@/modules/ai/recommendation/queries", () => ({
  getCurrentAiSalesRecommendation: vi.fn(),
  listAiSalesRecommendations: vi.fn(),
}));
vi.mock("@/modules/ai/analysis/queries", () => ({
  getLatestAiSalesAnalysis: vi.fn(),
  getLatestInboundMessageId: vi.fn(),
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
  requestCreateAppointment: vi.fn(),
  executeCreateFollowUp: vi.fn(),
  approveAiToolAction: vi.fn(),
  rejectAiToolAction: vi.fn(),
}));
vi.mock("@/modules/appointments/actions", () => ({
  createAppointment: vi.fn(),
}));
vi.mock("@/modules/follow-ups/actions", () => ({
  createLeadFollowUp: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  escalateToHuman: vi.fn(),
  pauseAI: vi.fn(),
  resumeAI: vi.fn(),
}));

import { getCurrentAiSalesRecommendation } from "@/modules/ai/recommendation/queries";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
} from "@/modules/ai/analysis/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import {
  requestCreateAppointment,
  executeCreateFollowUp,
  approveAiToolAction,
} from "@/modules/ai/actions/write";
import { createAppointment } from "@/modules/appointments/actions";
import { escalateToHuman, pauseAI, resumeAI } from "@/modules/ai/handoff";
import { requestHandoffFromRecommendation } from "@/modules/ai/recommendation/handoff-request";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";
const INBOUND_AT = "2026-08-21T10:00:00Z";
const PAUSED_AT = "2026-08-21T12:00:00.000Z";

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

const handoffAnalysis: AiSalesAnalysisPayload = {
  inboundIntent: "unclear",
  objection: "trust",
  urgency: "medium",
  qualification: "qualifying",
  inferredStage: "qualifying",
  buyingSignals: [],
  missingInformation: [],
  nextBestAction: "human_handoff",
  rationale: "Customer asked to speak with a person.",
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

const escalated: ConversationWithLead = {
  ...conversation,
  requires_human: true,
  ai_paused_at: PAUSED_AT,
  updated_at: PAUSED_AT,
};

const lead = {
  id: LEAD_1,
  organization_id: ORG_A,
  first_name: "Ahmed",
  last_name: "Ali",
  email: "ahmed@example.com",
  phone: "+974555",
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
  body: "I want to talk to a person.",
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
    recommended_action: "suggest_human_handoff",
    cited_analysis_action: "human_handoff",
    requires_human_approval: false,
    mapped_tool_name: null,
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
  conversationId: CONV_1,
};

describe("requestHandoffFromRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(recommendation());
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(getLead).mockResolvedValue(lead);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inboundMessage]);
    vi.mocked(buildPipelineSnapshot).mockResolvedValue(pipeline);
    vi.mocked(getLatestAiSalesAnalysis).mockResolvedValue({
      status: "recorded",
      payload: handoffAnalysis,
    } as never);
    vi.mocked(escalateToHuman).mockResolvedValue(escalated);
  });

  it("escalates through existing escalateToHuman after live handoff validation", async () => {
    const result = await requestHandoffFromRecommendation(gateInput);
    expect(result.requires_human).toBe(true);
    expect(result.ai_paused_at).toBe(PAUSED_AT);
    expect(escalateToHuman).toHaveBeenCalledTimes(1);
    expect(escalateToHuman).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
    expect(createAppointment).not.toHaveBeenCalled();
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(approveAiToolAction).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
  });

  it("does not treat requiresHumanApproval false as auto-execute", async () => {
    expect(recommendation().requires_human_approval).toBe(false);
    await requestHandoffFromRecommendation(gateInput);
    expect(escalateToHuman).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing current recommendation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new NotFoundError("Recommendation")
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      NotFoundError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a failed recommendation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ status: "failed" })
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a stale recommendation", async () => {
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(LATER);
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects an unsupported policy version", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ policy_version: "AI_SALES_RECOMMENDATION_POLICY_V0" })
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a conversation/lead identity mismatch", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ lead_id: "11111111-1111-4111-8111-111111111222" })
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects when live policy no longer matches", async () => {
    vi.mocked(getLatestAiSalesAnalysis).mockResolvedValue({
      status: "recorded",
      payload: { ...handoffAnalysis, nextBestAction: "wait_for_customer" },
    } as never);
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a closed conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects when the conversation already requires a human", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a paused conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      ai_paused_at: PAUSED_AT,
    });
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      ConflictError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a missing conversation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      NotFoundError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("rejects a non-member via recommendation lookup", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new TenantAccessError()
    );
    await expect(requestHandoffFromRecommendation(gateInput)).rejects.toThrow(
      TenantAccessError
    );
    expect(escalateToHuman).not.toHaveBeenCalled();
  });
});
