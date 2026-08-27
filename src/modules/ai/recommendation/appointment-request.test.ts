/**
 * Phase 4.10 recommendation → appointment HITL. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError, TenantAccessError, ValidationError } from "@/lib/errors";
import type { AiSalesRecommendation, ConversationWithLead, Lead, Message } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiToolAction, AiToolActionWithLead } from "@/lib/db/types";
import { hashAiToolInput } from "@/modules/ai/actions/hash";

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
vi.mock("@/modules/ai/actions/queries", () => ({
  getAiToolAction: vi.fn(),
  loadAiToolActionByInboundHash: vi.fn(),
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
import { requestCreateAppointment } from "@/modules/ai/actions/write";
import { createAppointment } from "@/modules/appointments/actions";
import {
  getAiToolAction,
  loadAiToolActionByInboundHash,
} from "@/modules/ai/actions/queries";
import { escalateToHuman } from "@/modules/ai/handoff";
import { requestAppointmentHitlFromRecommendation } from "@/modules/ai/recommendation/appointment-request";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INBOUND_AT = "2026-08-21T10:00:00Z";
const STARTS_AT = "2026-08-22T10:00:00.000Z";

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

const appointmentAnalysis: AiSalesAnalysisPayload = {
  inboundIntent: "appointment",
  objection: "none",
  urgency: "medium",
  qualification: "qualifying",
  inferredStage: "ready_for_appointment",
  buyingSignals: ["asking_viewing"],
  missingInformation: [],
  nextBestAction: "request_appointment_approval",
  rationale: "Customer asked to view the property on Friday.",
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
  body: "Can we view the unit Friday?",
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
    recommended_action: "suggest_appointment_approval",
    cited_analysis_action: "request_appointment_approval",
    requires_human_approval: true,
    mapped_tool_name: "create_appointment",
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

const storedAction = {
  id: ACTION_1,
  organization_id: ORG_A,
  conversation_id: CONV_1,
  lead_id: LEAD_1,
  inbound_message_id: INBOUND,
  tool_name: "create_appointment",
  trust: "human_approval",
  status: "pending",
  input_hash: hashAiToolInput({
    startsAt: STARTS_AT,
    endsAt: null,
    location: null,
    notes: null,
  }),
  payload: { startsAt: STARTS_AT, endsAt: null, location: null, notes: null },
  result_summary: {
    status: "pending_approval",
    startsAt: STARTS_AT,
    endsAt: null,
    location: null,
  },
  result_resource_type: null,
  result_resource_id: null,
  requested_by_user_id: USER_1,
  trigger_source: "operator",
  channel_identity_id: null,
  approved_by_user_id: null,
  decided_at: null,
  executed_at: null,
  expires_at: "2026-09-23T10:00:00.000Z",
  error_code: null,
  created_at: "2026-08-22T09:00:00Z",
  updated_at: "2026-08-22T09:00:00Z",
} as AiToolAction;

const actionWithLead: AiToolActionWithLead = {
  ...storedAction,
  lead: { id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: null },
};

const validPayload = { startsAt: STARTS_AT };

const gateInput = {
  organizationId: ORG_A,
  userId: USER_1,
  conversationId: CONV_1,
  payload: validPayload,
};

describe("requestAppointmentHitlFromRecommendation", () => {
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
      payload: appointmentAnalysis,
    } as never);
    vi.mocked(requestCreateAppointment).mockResolvedValue({
      status: "pending_approval",
      startsAt: STARTS_AT,
      endsAt: null,
      location: null,
    });
    vi.mocked(loadAiToolActionByInboundHash).mockResolvedValue(storedAction);
    vi.mocked(getAiToolAction).mockResolvedValue(actionWithLead);
  });

  it("creates a pending appointment HITL from a validated human startsAt", async () => {
    const result = await requestAppointmentHitlFromRecommendation(gateInput);
    expect(result.toolName).toBe("create_appointment");
    expect(result.trust).toBe("human_approval");
    expect(result.status).toBe("pending");
    expect(result.summary.startsAt).toBe(STARTS_AT);
    expect(requestCreateAppointment).toHaveBeenCalledTimes(1);
    expect(requestCreateAppointment).toHaveBeenCalledWith(
      {
        organizationId: ORG_A,
        userId: USER_1,
        triggerSource: "operator",
        channelIdentityId: null,
        conversationId: CONV_1,
        leadId: LEAD_1,
        inboundMessageId: INBOUND,
      },
      expect.objectContaining({ startsAt: STARTS_AT })
    );
    expect(createAppointment).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
  });

  it("does not take identity from the request body", async () => {
    await requestAppointmentHitlFromRecommendation({
      ...gateInput,
      payload: {
        startsAt: STARTS_AT,
      },
    });
    const ctx = vi.mocked(requestCreateAppointment).mock.calls[0]?.[0];
    expect(ctx).toEqual({
      organizationId: ORG_A,
      userId: USER_1,
      triggerSource: "operator",
      channelIdentityId: null,
      conversationId: CONV_1,
      leadId: LEAD_1,
      inboundMessageId: INBOUND,
    });
  });

  it("uses only the human body for startsAt", async () => {
    await requestAppointmentHitlFromRecommendation(gateInput);
    const payload = vi.mocked(requestCreateAppointment).mock.calls[0]?.[1];
    const raw = JSON.stringify(payload);
    expect(payload?.startsAt).toBe(STARTS_AT);
    expect(raw).not.toContain("Customer asked to view the property on Friday.");
    expect(raw).not.toContain("cited_model_action");
    expect(raw).not.toContain("ahmed@example.com");
    expect(raw).not.toContain("Can we view the unit Friday?");
  });

  it("rejects a missing startsAt", async () => {
    await expect(
      requestAppointmentHitlFromRecommendation({
        ...gateInput,
        payload: {},
      })
    ).rejects.toThrow(ValidationError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects an invalid startsAt", async () => {
    await expect(
      requestAppointmentHitlFromRecommendation({
        ...gateInput,
        payload: { startsAt: "not-a-date" },
      })
    ).rejects.toThrow(ValidationError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects endsAt that is not after startsAt", async () => {
    await expect(
      requestAppointmentHitlFromRecommendation({
        ...gateInput,
        payload: { startsAt: STARTS_AT, endsAt: STARTS_AT },
      })
    ).rejects.toThrow(ValidationError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects unexpected body fields", async () => {
    await expect(
      requestAppointmentHitlFromRecommendation({
        ...gateInput,
        payload: { startsAt: STARTS_AT, organizationId: ORG_A },
      })
    ).rejects.toThrow(ValidationError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a missing current recommendation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new NotFoundError("Recommendation")
    );
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(NotFoundError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a failed recommendation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ status: "failed" })
    );
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a stale recommendation", async () => {
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(LATER);
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects an unsupported policy version", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ policy_version: "AI_SALES_RECOMMENDATION_POLICY_V0" })
    );
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects when live policy no longer matches", async () => {
    vi.mocked(getLatestAiSalesAnalysis).mockResolvedValue({
      status: "recorded",
      payload: { ...appointmentAnalysis, nextBestAction: "provide_information" },
    } as never);
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a closed conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a paused conversation", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      ai_paused_at: "2026-08-21T10:05:00Z",
    });
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects when the conversation requires a human", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects when a scheduled appointment already exists", async () => {
    vi.mocked(buildPipelineSnapshot).mockResolvedValue({
      ...pipeline,
      hasScheduledAppointment: true,
    });
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects when a pending appointment HITL already exists", async () => {
    vi.mocked(buildPipelineSnapshot).mockResolvedValue({
      ...pipeline,
      hasPendingAppointmentApproval: true,
    });
    vi.mocked(loadAiToolActionByInboundHash).mockResolvedValue(null);
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("replays the same payload through existing HITL uniqueness", async () => {
    await requestAppointmentHitlFromRecommendation(gateInput);
    await requestAppointmentHitlFromRecommendation(gateInput);
    expect(requestCreateAppointment).toHaveBeenCalledTimes(2);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("replays the same human payload when that pending HITL already exists", async () => {
    vi.mocked(buildPipelineSnapshot).mockResolvedValue({
      ...pipeline,
      hasPendingAppointmentApproval: true,
    });
    const result = await requestAppointmentHitlFromRecommendation(gateInput);
    expect(result.status).toBe("pending");
    expect(requestCreateAppointment).toHaveBeenCalledTimes(1);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it("rejects a conversation/lead identity mismatch", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(
      recommendation({ lead_id: "11111111-1111-4111-8111-111111111222" })
    );
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(ConflictError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("does not create a second pending row when two requests run concurrently", async () => {
    await Promise.all([
      requestAppointmentHitlFromRecommendation(gateInput),
      requestAppointmentHitlFromRecommendation(gateInput),
    ]);
    expect(requestCreateAppointment).toHaveBeenCalledTimes(2);
    expect(loadAiToolActionByInboundHash).toHaveBeenCalled();
  });

  it("looks up the stored action by the existing input hash", async () => {
    await requestAppointmentHitlFromRecommendation(gateInput);
    expect(loadAiToolActionByInboundHash).toHaveBeenCalledWith(
      ORG_A,
      INBOUND,
      "create_appointment",
      hashAiToolInput({
        startsAt: STARTS_AT,
        endsAt: null,
        location: null,
        notes: null,
      })
    );
  });

  it("rejects a cross-tenant conversation", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(NotFoundError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("rejects a non-member via conversation lookup", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new TenantAccessError()
    );
    await expect(
      requestAppointmentHitlFromRecommendation(gateInput)
    ).rejects.toThrow(TenantAccessError);
    expect(requestCreateAppointment).not.toHaveBeenCalled();
  });

  it("does not return the raw payload or analysis rationale", async () => {
    const result = await requestAppointmentHitlFromRecommendation(gateInput);
    const raw = JSON.stringify(result);
    expect(raw).not.toContain("Customer asked to view the property on Friday.");
    expect(raw).not.toContain("payload");
    expect(result).not.toHaveProperty("payload");
    expect(result).not.toHaveProperty("organizationId");
  });
});
