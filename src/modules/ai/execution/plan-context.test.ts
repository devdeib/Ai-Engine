/**
 * Plan-context loader tests. Asserts read-only I/O and no execution writes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";
import type { ConversationWithLead, Lead, Message } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysis } from "@/lib/db/types";
import { AI_SALES_ANALYSIS_PROMPT_VERSION, AI_SALES_ANALYSIS_SCHEMA_VERSION } from "@/modules/ai/analysis/constants";

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
vi.mock("@/modules/ai/analysis/queries", () => ({
  getLatestAiSalesAnalysis: vi.fn(),
  getLatestInboundMessageId: vi.fn(),
}));
vi.mock("@/modules/ai/execution/queries", () => ({
  listConversationToolActions: vi.fn(),
  hasInboundFollowUpAction: vi.fn(),
  loadRecommendationByInbound: vi.fn(),
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

import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { getLead } from "@/modules/leads/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
} from "@/modules/ai/analysis/queries";
import { listConversationToolActions } from "@/modules/ai/execution/queries";
import {
  executeCreateFollowUp,
  requestCreateAppointment,
} from "@/modules/ai/actions/write";
import { escalateToHuman, pauseAI, resumeAI } from "@/modules/ai/handoff";
import { loadRecommendationPlanContext } from "@/modules/ai/execution/plan-context";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

const pipeline: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: "2026-08-21T10:00:00Z",
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
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
  body: "Please follow up",
  in_reply_to_message_id: null,
  channel_identity_id: null,
  created_at: "2026-08-21T10:00:00Z",
};

describe("loadRecommendationPlanContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inboundMessage]);
    vi.mocked(getLead).mockResolvedValue(lead);
    vi.mocked(buildPipelineSnapshot).mockResolvedValue(pipeline);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(getLatestAiSalesAnalysis).mockRejectedValue(
      new NotFoundError("Analysis")
    );
    vi.mocked(listConversationToolActions).mockResolvedValue([]);
  });

  it("loads live snapshot and analysis without writing", async () => {
    const context = await loadRecommendationPlanContext(ORG_A, USER_1, CONV_1);
    expect(context.liveSnapshot).toEqual(pipeline);
    expect(context.analysisPayload).toBeNull();
    expect(context.latestInboundId).toBe(INBOUND);
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(requestCreateAppointment).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(pauseAI).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
  });

  it("does not pass lead email or phone into the returned context payload", async () => {
    const context = await loadRecommendationPlanContext(ORG_A, USER_1, CONV_1);
    const raw = JSON.stringify(context.analysisPayload);
    expect(raw).not.toContain("ahmed@example.com");
    expect(raw).not.toContain("+974555");
    expect(JSON.stringify(context.liveSnapshot)).not.toContain("Please follow up");
  });

  it("returns tenant_mismatch when the conversation cannot be loaded", async () => {
    vi.mocked(getConversation).mockRejectedValue(new TenantAccessError());
    const context = await loadRecommendationPlanContext(ORG_A, USER_1, CONV_1);
    expect(context.contextSkipReason).toBe("tenant_mismatch");
    expect(context.liveSnapshot).toBeNull();
    expect(executeCreateFollowUp).not.toHaveBeenCalled();
  });

  it("uses a recorded analysis payload when present", async () => {
    vi.mocked(getLatestAiSalesAnalysis).mockResolvedValue({
      id: "ana-1",
      organization_id: ORG_A,
      conversation_id: CONV_1,
      lead_id: LEAD_1,
      inbound_message_id: INBOUND,
      inbound_message_created_at: "2026-08-21T10:00:00Z",
      status: "recorded",
      payload: {
        inboundIntent: "general_question",
        objection: "none",
        urgency: "medium",
        qualification: "qualifying",
        inferredStage: "qualifying",
        buyingSignals: [],
        missingInformation: [],
        nextBestAction: "provide_information",
        rationale: "Share details.",
        confidence: 0.9,
      },
      pipeline_snapshot: {},
      error_code: null,
      requested_by_user_id: USER_1,
      trigger_source: "operator",
      channel_identity_id: null,
      created_at: "2026-08-21T10:01:00Z",
      updated_at: "2026-08-21T10:01:00Z",
      schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
      prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
      provider_name: "mock",
    } as AiSalesAnalysis);

    const context = await loadRecommendationPlanContext(ORG_A, USER_1, CONV_1);
    expect(context.analysisPayload?.nextBestAction).toBe("provide_information");
  });
});
