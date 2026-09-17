/**
 * Tool-assisted processConversationMessage tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";
import { AI_MAX_TOOL_CALLS } from "@/modules/ai/types";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/conversations/queries", () => ({
  getConversation: vi.fn(),
  listRecentConversationMessages: vi.fn(),
  CONVERSATION_WITH_LEAD_SELECT: "*",
}));
vi.mock("@/modules/ai/context", () => ({
  buildAiContext: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/enqueue", () => ({
  enqueueOutboundDeliveryIfExternal: vi.fn(),
}));
vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));
vi.mock("@/modules/ai/pipeline", () => ({
  buildPipelineSnapshot: vi.fn(),
}));
vi.mock("@/modules/ai/analysis/persist", () => ({
  persistAiSalesAnalysis: vi.fn(),
}));
vi.mock("@/modules/ai/recommendation/persist", () => ({
  persistAiSalesRecommendation: vi.fn(),
}));
vi.mock("@/modules/ai/execution/execute", () => ({
  executeFromRecommendation: vi.fn(),
}));
vi.mock("@/modules/leads/queries", () => ({
  getLead: vi.fn(),
}));
vi.mock("@/modules/ai/actions/write", () => ({
  executeCreateFollowUp: vi.fn(),
  requestCreateAppointment: vi.fn(),
  approveAiToolAction: vi.fn(),
  rejectAiToolAction: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { buildAiContext } from "@/modules/ai/context";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { buildPipelineSnapshot } from "@/modules/ai/pipeline";
import { persistAiSalesAnalysis } from "@/modules/ai/analysis/persist";
import { persistAiSalesRecommendation } from "@/modules/ai/recommendation/persist";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { getLead } from "@/modules/leads/queries";
import { executeCreateFollowUp, requestCreateAppointment } from "@/modules/ai/actions/write";
import { processConversationMessage } from "@/modules/ai/service";
import { MockAiProvider } from "@/modules/ai/providers/mock";
import type { AiContext } from "@/modules/ai/types";
import { EMPTY_AI_SALES_PROFILE } from "@/modules/ai/types";
import { leadQualificationContextFields } from "@/modules/leads/qualification";
import type { ConversationWithLead, Lead, LeadActivity, Message } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND_ID = "11111111-0000-4000-8000-0000000000aa";
const AI_MSG_ID = "22222222-0000-4000-8000-0000000000bb";
const ACTIVITY_ID = "33333333-0000-4000-8000-0000000000cc";

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

const inbound: Message = {
  id: INBOUND_ID,
  organization_id: ORG_A,
  conversation_id: CONV_1,
  author_user_id: USER_1,
  author_type: "human",
  direction: "inbound",
  body: "Can we meet?",
  in_reply_to_message_id: null,
  channel_identity_id: null,
  created_at: "2026-08-21T10:00:00Z",
};

const aiContext: AiContext = {
  organization: { name: "Acme", salesProfile: EMPTY_AI_SALES_PROFILE },
  lead: {
    firstName: "Ahmed",
    lastName: "Ali",
    companyName: null,
    email: null,
    phone: null,
    status: "new",
    score: null,
    notes: null,
    ...leadQualificationContextFields({ email: null, phone: null }),
  },
  conversation: {
    channel: "in_app",
    status: "open",
    requiresHuman: false,
    aiPausedAt: null,
  },
  messages: [],
  latestCustomerMessage: null,
  followUps: [],
  appointments: [],
  recentActivities: [],
  pipeline: {
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
  },
};

function mockInsert(capturedInsert: { value: Record<string, unknown> | null }) {
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInsert.value = payload;
    return {
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: { id: AI_MSG_ID, ...payload },
          error: null,
        }),
      }),
    };
  });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: conversation, error: null }),
        }),
      }),
    }),
  });
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") return { insert };
      if (table === "conversations") return { update };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("processConversationMessage tool loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inbound]);
    vi.mocked(buildAiContext).mockResolvedValue(aiContext);
    vi.mocked(buildPipelineSnapshot).mockResolvedValue(aiContext.pipeline);
    vi.mocked(persistAiSalesAnalysis).mockResolvedValue(null);
    vi.mocked(persistAiSalesRecommendation).mockResolvedValue(null);
    vi.mocked(executeFromRecommendation).mockResolvedValue({
      outcome: "skipped",
      reason: "recommendation_unavailable",
    });
    vi.mocked(recordLeadActivity).mockResolvedValue({
      id: ACTIVITY_ID,
      type: "ai",
      content: "AI response generated",
    } as LeadActivity);
    vi.mocked(getLead).mockResolvedValue({
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
    } as Lead);
    vi.mocked(executeCreateFollowUp).mockResolvedValue({
      status: "created",
      title: "Call Ahmed",
      dueAt: "2026-08-22T10:00:00.000Z",
    });
  });

  it("uses a tool result then persists exactly one AI message and activity", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = { value: null };
    mockInsert(capturedInsert);
    const provider = new MockAiProvider("We can meet this week.", [
      {
        type: "tool_call",
        id: "call-1",
        name: "get_lead_context",
        arguments: {},
      },
    ]);
    const generateResponse = vi.spyOn(provider, "generateResponse");

    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });

    expect(result).toEqual({
      outcome: "responded",
      messageId: AI_MSG_ID,
      activityId: ACTIVITY_ID,
    });
    expect(generateResponse).toHaveBeenCalledTimes(2);
    const first = generateResponse.mock.calls[0]?.[0];
    expect(first?.tools?.map((tool) => tool.name)).toEqual([
      "get_lead_context",
      "get_conversation_history",
      "get_lead_appointments",
      "get_lead_follow_ups",
      "create_follow_up",
      "create_appointment",
      "record_customer_facts",
    ]);
    expect(JSON.stringify(first?.tools)).not.toContain("organizationId");
    const second = generateResponse.mock.calls[1]?.[0];
    expect(second?.history).toEqual([
      expect.objectContaining({ role: "assistant" }),
      expect.objectContaining({
        role: "tool",
        result: expect.objectContaining({ ok: true, name: "get_lead_context" }),
      }),
    ]);
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(capturedInsert.value?.author_type).toBe("ai");
  });

  it("counts an unknown tool toward the limit and still allows a final text reply", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = { value: null };
    mockInsert(capturedInsert);
    const provider = new MockAiProvider("I will have a teammate follow up.", [
      { type: "tool_call", id: "x", name: "fetch", arguments: { url: "https://evil" } },
    ]);

    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result.outcome).toBe("responded");
    expect(getLead).not.toHaveBeenCalled();
  });

  it("stops after the maximum number of tool calls without persisting", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = { value: null };
    mockInsert(capturedInsert);
    const provider = new MockAiProvider("should not send", [
      { type: "tool_call", id: "1", name: "get_lead_context", arguments: {} },
      { type: "tool_call", id: "2", name: "get_lead_context", arguments: {} },
      { type: "tool_call", id: "3", name: "get_lead_context", arguments: {} },
    ]);

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider })
    ).rejects.toMatchObject({
      name: "AiToolError",
      code: "AI_TOOL_LIMIT_EXCEEDED",
    });
    expect(AI_MAX_TOOL_CALLS).toBe(2);
    expect(capturedInsert.value).toBeNull();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(persistAiSalesAnalysis).not.toHaveBeenCalled();
  });

  it("aborts authorization failures during a tool call without a fake AI activity", async () => {
    vi.mocked(getLead).mockRejectedValue(new TenantAccessError());
    const capturedInsert: { value: Record<string, unknown> | null } = { value: null };
    mockInsert(capturedInsert);
    const provider = new MockAiProvider("Hi", [
      { type: "tool_call", id: "1", name: "get_lead_context", arguments: {} },
    ]);

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider })
    ).rejects.toThrow(TenantAccessError);
    expect(capturedInsert.value).toBeNull();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not let the model override trusted conversation scope via tool arguments", async () => {
    mockInsert({ value: null });
    const provider = new MockAiProvider("Thanks.", [
      {
        type: "tool_call",
        id: "1",
        name: "get_lead_context",
        arguments: { conversationId: "forged", organizationId: "forged" },
      },
    ]);
    const generateResponse = vi.spyOn(provider, "generateResponse");

    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider });
    expect(getLead).not.toHaveBeenCalled();
    const toolResult = generateResponse.mock.calls[1]?.[0]?.history?.[1];
    expect(toolResult).toEqual(
      expect.objectContaining({
        role: "tool",
        result: { ok: false, name: "get_lead_context", code: "AI_TOOL_INVALID_ARGUMENTS" },
      })
    );
  });

  it("uses a write tool then persists exactly one AI message", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = { value: null };
    mockInsert(capturedInsert);
    const provider = new MockAiProvider("A teammate will confirm the time.", [
      {
        type: "tool_call",
        id: "call-1",
        name: "create_follow_up",
        arguments: { title: "Call Ahmed", dueAt: "2026-08-22T10:00:00Z" },
      },
    ]);

    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result.outcome).toBe("responded");
    expect(executeCreateFollowUp).toHaveBeenCalledTimes(1);
    expect(executeCreateFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        leadId: LEAD_1,
        inboundMessageId: INBOUND_ID,
      }),
      expect.objectContaining({ title: "Call Ahmed" })
    );
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(capturedInsert.value?.author_type).toBe("ai");
  });

  it("counts a write tool toward the limit", async () => {
    mockInsert({ value: null });
    const provider = new MockAiProvider("should not send", [
      { type: "tool_call", id: "1", name: "get_lead_context", arguments: {} },
      {
        type: "tool_call",
        id: "2",
        name: "create_follow_up",
        arguments: { title: "Call Ahmed", dueAt: "2026-08-22T10:00:00Z" },
      },
      { type: "tool_call", id: "3", name: "get_lead_context", arguments: {} },
    ]);

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider })
    ).rejects.toMatchObject({
      name: "AiToolError",
      code: "AI_TOOL_LIMIT_EXCEEDED",
    });
    expect(executeCreateFollowUp).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(persistAiSalesAnalysis).not.toHaveBeenCalled();
  });

  it("rebuilds the pipeline snapshot after tools so HITL pending is visible", async () => {
    mockInsert({ value: null });
    vi.mocked(requestCreateAppointment).mockResolvedValue({
      status: "pending_approval",
      startsAt: "2026-08-22T10:00:00.000Z",
      endsAt: null,
      location: null,
    });
    vi.mocked(buildPipelineSnapshot).mockResolvedValue({
      ...aiContext.pipeline,
      hasPendingAppointmentApproval: true,
    });
    const provider = new MockAiProvider("A teammate will confirm.", [
      {
        type: "tool_call",
        id: "1",
        name: "create_appointment",
        arguments: { startsAt: "2026-08-22T10:00:00Z" },
      },
    ]);

    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider });
    expect(buildPipelineSnapshot).toHaveBeenCalledTimes(1);
    expect(persistAiSalesAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline: expect.objectContaining({ hasPendingAppointmentApproval: true }),
      })
    );
  });
});
