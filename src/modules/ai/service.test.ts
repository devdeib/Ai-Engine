/**
 * AI execution pipeline tests. LLM is always a mock. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError, TenantAccessError, ValidationError } from "@/lib/errors";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";

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
vi.mock("@/modules/ai/recommendation/policy", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/modules/ai/recommendation/policy")>();
  return {
    ...actual,
    recommend: vi.fn((...args: Parameters<typeof actual.recommend>) =>
      actual.recommend(...args)
    ),
  };
});
vi.mock("@/modules/ai/execution/execute", () => ({
  executeFromRecommendation: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/enqueue", () => ({
  enqueueOutboundDeliveryIfExternal: vi.fn(),
}));
vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
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
import { recommend } from "@/modules/ai/recommendation/policy";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { processConversationMessage } from "@/modules/ai/service";
import { enqueueOutboundDeliveryIfExternal } from "@/modules/channels/delivery/enqueue";
import { MockAiProvider } from "@/modules/ai/providers/mock";
import { AiMalformedResponseError, AiProviderError } from "@/modules/ai/errors";
import type { AiContext, AiProviderResponse } from "@/modules/ai/types";
import { EMPTY_AI_SALES_PROFILE } from "@/modules/ai/types";
import { leadQualificationContextFields } from "@/modules/leads/qualification";
import type { AiProvider } from "@/modules/ai/providers/types";
import type { ConversationWithLead, LeadActivity, Message } from "@/lib/db/types";

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
  body: "Hi, is the unit still available?",
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

const recordedActivity = {
  id: ACTIVITY_ID,
  organization_id: ORG_A,
  lead_id: LEAD_1,
  user_id: USER_1,
  type: "ai",
  content: "AI response generated",
  created_at: "2026-08-21T10:01:00Z",
} as LeadActivity;

function spyProvider(text = "Hi") {
  const provider = new MockAiProvider(text);
  const generateResponse = vi.spyOn(provider, "generateResponse");
  return { provider, generateResponse };
}

function mockInsert({
  inserted,
  insertError,
  capturedInsert,
  insertImpl,
}: {
  inserted: Record<string, unknown> | null;
  insertError?: { code?: string; message: string } | null;
  capturedInsert: { value: Record<string, unknown> | null };
  insertImpl?: (payload: Record<string, unknown>) => {
    data: Record<string, unknown> | null;
    error: { code?: string; message: string } | null;
  };
}) {
  const insertSingle = vi.fn().mockImplementation(async () => {
    if (insertImpl) {
      return insertImpl(capturedInsert.value ?? {});
    }
    return {
      data: inserted,
      error: insertError ?? (inserted ? null : { message: "Insert failed" }),
    };
  });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInsert.value = payload;
    return { select: insertSelect };
  });

  const updateSingle = vi.fn().mockResolvedValue({
    data: conversation,
    error: null,
  });
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelect });
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
  const update = vi.fn().mockReturnValue({ eq: updateEqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") return { insert };
      if (table === "conversations") return { update };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { insert };
}

describe("processConversationMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inbound]);
    vi.mocked(buildAiContext).mockResolvedValue(aiContext);
    vi.mocked(recordLeadActivity).mockResolvedValue(recordedActivity);
    vi.mocked(buildPipelineSnapshot).mockResolvedValue(aiContext.pipeline);
    vi.mocked(persistAiSalesAnalysis).mockResolvedValue(null);
    vi.mocked(persistAiSalesRecommendation).mockResolvedValue(null);
    vi.mocked(executeFromRecommendation).mockResolvedValue({
      outcome: "skipped",
      reason: "recommendation_unavailable",
    });
  });

  it("rejects unauthenticated org access", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("Hi"),
      })
    ).rejects.toThrow(TenantAccessError);
  });

  it("rejects a cross-tenant conversation", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
    const { provider, generateResponse } = spyProvider();
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider })
    ).rejects.toThrow(NotFoundError);
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it("skips when the conversation is closed and does not call the provider", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "closed" });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(buildAiContext).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(persistAiSalesAnalysis).not.toHaveBeenCalled();
    expect(persistAiSalesRecommendation).not.toHaveBeenCalled();
  });

  it("skips when AI is paused and does not call the provider", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      ai_paused_at: "2026-08-21T12:00:00Z",
    });
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "paused" });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(enqueueOutboundDeliveryIfExternal).not.toHaveBeenCalled();
  });

  it("returns escalated when requires_human is true and does not call the provider", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({
      outcome: "escalated",
      reason: "requires_human",
    });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(persistAiSalesRecommendation).not.toHaveBeenCalled();
    expect(enqueueOutboundDeliveryIfExternal).not.toHaveBeenCalled();
  });

  it("skips when no inbound message exists", async () => {
    vi.mocked(listRecentConversationMessages).mockResolvedValue([]);
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "no_inbound" });
    expect(generateResponse).not.toHaveBeenCalled();
  });

  it("skips when the latest message is outbound", async () => {
    vi.mocked(listRecentConversationMessages).mockResolvedValue([
      inbound,
      { ...inbound, id: "out", direction: "outbound" },
    ]);
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "latest_outbound" });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(enqueueOutboundDeliveryIfExternal).toHaveBeenCalledWith({
      organizationId: ORG_A,
      conversation,
      messageId: "out",
    });
  });

  it("skips when the inbound message already has an AI reply", async () => {
    vi.mocked(listRecentConversationMessages).mockResolvedValue([
      {
        ...inbound,
        id: "out-1",
        direction: "outbound",
        author_type: "ai",
        author_user_id: null,
        in_reply_to_message_id: INBOUND_ID,
      },
      inbound,
    ]);
    const { provider, generateResponse } = spyProvider();
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider,
    });
    expect(result).toEqual({ outcome: "skipped", reason: "already_replied" });
    expect(generateResponse).not.toHaveBeenCalled();
    expect(enqueueOutboundDeliveryIfExternal).toHaveBeenCalledWith({
      organizationId: ORG_A,
      conversation,
      messageId: "out-1",
    });
  });

  it("persists an AI outbound message and records activity", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockInsert({
      capturedInsert,
      inserted: {
        ...inbound,
        id: AI_MSG_ID,
        author_user_id: null,
        author_type: "ai",
        direction: "outbound",
        body: "Thanks for your message.",
        in_reply_to_message_id: INBOUND_ID,
      },
    });

    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Thanks for your message."),
    });

    expect(result).toEqual({
      outcome: "responded",
      messageId: AI_MSG_ID,
      activityId: ACTIVITY_ID,
    });
    expect(buildAiContext).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        inboundMessageId: INBOUND_ID,
      })
    );
    expect(capturedInsert.value).toEqual({
      organization_id: ORG_A,
      conversation_id: CONV_1,
      author_user_id: null,
      author_type: "ai",
      direction: "outbound",
      body: "Thanks for your message.",
      in_reply_to_message_id: INBOUND_ID,
    });
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "ai",
      content: "AI response generated",
    });
    expect(persistAiSalesAnalysis).toHaveBeenCalledTimes(1);
    expect(persistAiSalesRecommendation).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(enqueueOutboundDeliveryIfExternal).toHaveBeenCalledWith({
      organizationId: ORG_A,
      conversation,
      messageId: AI_MSG_ID,
    });
  });

  it("surfaces delivery enqueue failure after AI outbound persist", async () => {
    mockInsert({
      capturedInsert: { value: null },
      inserted: {
        ...inbound,
        id: AI_MSG_ID,
        author_user_id: null,
        author_type: "ai",
        direction: "outbound",
        body: "Thanks for your message.",
        in_reply_to_message_id: INBOUND_ID,
      },
    });
    vi.mocked(enqueueOutboundDeliveryIfExternal).mockRejectedValueOnce(
      new Error("Failed to enqueue channel delivery job")
    );

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("Thanks for your message."),
      })
    ).rejects.toThrow("Failed to enqueue channel delivery job");
  });

  it("attributes the persisted message as AI with the inbound reply target", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockInsert({
      capturedInsert,
      inserted: { id: AI_MSG_ID, author_type: "ai", author_user_id: null },
    });

    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });

    expect(capturedInsert.value?.author_type).toBe("ai");
    expect(capturedInsert.value?.author_user_id).toBeNull();
    expect(capturedInsert.value?.direction).toBe("outbound");
    expect(capturedInsert.value?.in_reply_to_message_id).toBe(INBOUND_ID);
    expect(capturedInsert.value?.organization_id).toBe(ORG_A);
    expect(capturedInsert.value?.conversation_id).toBe(CONV_1);
  });

  it("maps a unique-constraint race to ConflictError", async () => {
    mockInsert({
      capturedInsert: { value: null },
      inserted: null,
      insertError: { code: "23505", message: "duplicate key" },
    });

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("Hi"),
      })
    ).rejects.toThrow(ConflictError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("treats concurrent executions as a conflict via the unique constraint", async () => {
    let insertCount = 0;
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID },
      insertImpl: () => {
        insertCount += 1;
        if (insertCount === 1) {
          return { data: { id: AI_MSG_ID }, error: null };
        }
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      },
    });

    const [first, second] = await Promise.allSettled([
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("First"),
      }),
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("Second"),
      }),
    ]);

    expect(first.status).toBe("fulfilled");
    if (first.status === "fulfilled") {
      expect(first.value).toEqual({
        outcome: "responded",
        messageId: AI_MSG_ID,
        activityId: ACTIVITY_ID,
      });
    }
    expect(second.status).toBe("rejected");
    if (second.status === "rejected") {
      expect(second.reason).toBeInstanceOf(ConflictError);
    }
    expect(insertCount).toBe(2);
  });

  it("does not persist a message or activity when the provider fails", async () => {
    const generateResponse = vi.fn(async () => {
      throw new AiProviderError();
    });
    const failing: AiProvider = { name: "failing", generateResponse };
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockInsert({ capturedInsert, inserted: { id: AI_MSG_ID } });

    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider: failing })
    ).rejects.toThrow(AiProviderError);
    expect(capturedInsert.value).toBeNull();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects a malformed provider response without persisting", async () => {
    const provider: AiProvider = {
      name: "malformed",
      generateResponse: async () =>
        ({ text: 42 }) as unknown as AiProviderResponse,
    };
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider })
    ).rejects.toThrow(AiMalformedResponseError);
    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("rejects an empty provider response without persisting", async () => {
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider(""),
      })
    ).rejects.toThrow(AiMalformedResponseError);
    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only provider response without persisting", async () => {
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("   \n"),
      })
    ).rejects.toThrow(AiMalformedResponseError);
    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("rejects an oversized provider response without truncating or persisting", async () => {
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider("x".repeat(MESSAGE_BODY_MAX + 1)),
      })
    ).rejects.toThrow(AiMalformedResponseError);
    expect(createClient).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("ignores client-forged identity fields by never reading a body", async () => {
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockInsert({
      capturedInsert,
      inserted: {
        id: AI_MSG_ID,
        author_type: "ai",
        author_user_id: null,
      },
    });

    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });

    expect(capturedInsert.value?.author_type).toBe("ai");
    expect(capturedInsert.value?.author_user_id).toBeNull();
    expect(capturedInsert.value?.organization_id).toBe(ORG_A);
  });

  it("does not persist analysis when the customer reply is malformed", async () => {
    await expect(
      processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
        provider: new MockAiProvider(""),
      })
    ).rejects.toThrow(AiMalformedResponseError);
    expect(persistAiSalesAnalysis).not.toHaveBeenCalled();
    expect(persistAiSalesRecommendation).not.toHaveBeenCalled();
  });

  it("still sends the reply when analysis persistence fails", async () => {
    vi.mocked(persistAiSalesAnalysis).mockRejectedValue(new Error("db down"));
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai", author_user_id: null },
    });
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });
    expect(result.outcome).toBe("responded");
  });

  it("records failed analysis when generateSalesAnalysis is missing", async () => {
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai" },
    });
    const provider: AiProvider = {
      name: "text-only",
      generateResponse: async () => ({ type: "text", text: "Hello." }),
    };
    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider });
    expect(persistAiSalesAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: null,
        errorCode: "AI_MALFORMED_ANALYSIS",
        inboundMessageId: INBOUND_ID,
      })
    );
  });

  it("rebuilds the snapshot and persists a recommendation before the AI message", async () => {
    const analysisRow = {
      id: "ana-1",
      status: "recorded" as const,
      payload: {
        inboundIntent: "general_question",
        objection: "none",
        urgency: "unknown",
        qualification: "unknown",
        inferredStage: "exploring",
        buyingSignals: [],
        missingInformation: [],
        nextBestAction: "provide_information",
        rationale: "Default mock analysis for tests.",
        confidence: 0.5,
      },
    };
    vi.mocked(persistAiSalesAnalysis).mockResolvedValue(analysisRow as never);
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    const { insert } = mockInsert({
      capturedInsert,
      inserted: { id: AI_MSG_ID, author_type: "ai" },
    });

    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hello there."),
    });

    expect(buildPipelineSnapshot).toHaveBeenCalled();
    expect(persistAiSalesAnalysis).toHaveBeenCalled();
    expect(persistAiSalesRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessageId: INBOUND_ID,
        analysisId: "ana-1",
        analysisStatus: "recorded",
        pipeline: aiContext.pipeline,
        errorCode: null,
        decision: expect.objectContaining({
          recommendedAction: "provide_information",
          mappedToolName: null,
          requiresHumanApproval: false,
        }),
      })
    );
    const analysisOrder = vi.mocked(persistAiSalesAnalysis).mock.invocationCallOrder[0] ?? 0;
    const recommendationOrder =
      vi.mocked(persistAiSalesRecommendation).mock.invocationCallOrder[0] ?? 0;
    const executionOrder =
      vi.mocked(executeFromRecommendation).mock.invocationCallOrder[0] ?? 0;
    const insertOrder = insert.mock.invocationCallOrder[0] ?? 0;
    expect(analysisOrder).toBeLessThan(recommendationOrder);
    expect(recommendationOrder).toBeLessThan(executionOrder);
    /* Message insert and delivery enqueue now happen BEFORE advisory
       analysis so the customer response is not delayed by CRM enrichment. */
    expect(insertOrder).toBeLessThan(analysisOrder);
  });

  it("still sends the reply when recommendation execution throws", async () => {
    vi.mocked(executeFromRecommendation).mockRejectedValue(new Error("gate boom"));
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai", author_user_id: null },
    });
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });
    expect(result.outcome).toBe("responded");
    expect(executeFromRecommendation).toHaveBeenCalled();
  });

  it("does not call the execution gate when eligibility skips", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    const { provider } = spyProvider();
    await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, { provider });
    expect(executeFromRecommendation).not.toHaveBeenCalled();
  });

  it("records wait_for_customer when analysis persistence returns a failed row", async () => {
    vi.mocked(persistAiSalesAnalysis).mockResolvedValue({
      id: "ana-fail",
      status: "failed",
      payload: {},
    } as never);
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai" },
    });

    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hello there."),
    });

    expect(result.outcome).toBe("responded");
    expect(persistAiSalesRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        analysisId: "ana-fail",
        analysisStatus: "failed",
        analysisPayload: null,
        errorCode: null,
        decision: expect.objectContaining({
          recommendedAction: "wait_for_customer",
          reasonCodes: ["analysis_unavailable"],
          mappedToolName: null,
          requiresHumanApproval: false,
        }),
      })
    );
  });

  it("still sends the reply when recommendation persistence fails", async () => {
    vi.mocked(persistAiSalesRecommendation).mockRejectedValue(new Error("rec down"));
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai", author_user_id: null },
    });
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });
    expect(result.outcome).toBe("responded");
  });

  it("still sends the reply when recommendation policy throws", async () => {
    vi.mocked(recommend).mockImplementationOnce(() => {
      throw new Error("policy boom");
    });
    mockInsert({
      capturedInsert: { value: null },
      inserted: { id: AI_MSG_ID, author_type: "ai" },
    });
    const result = await processConversationMessage(ORG_A, CONV_1, { kind: "operator", userId: USER_1 }, {
      provider: new MockAiProvider("Hi there."),
    });
    expect(result.outcome).toBe("responded");
    expect(persistAiSalesRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "AI_RECOMMENDATION_FAILED",
        decision: expect.objectContaining({
          recommendedAction: "wait_for_customer",
          mappedToolName: null,
          requiresHumanApproval: false,
        }),
      })
    );
  });

  describe("channel_ingress principal", () => {
    const identityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const externalConversation: ConversationWithLead = {
      ...conversation,
      channel: "test",
      channel_account_id: accountId,
      channel_identity_id: identityId,
    };
    const customerInbound: Message = {
      ...inbound,
      author_user_id: null,
      author_type: "customer",
      channel_identity_id: identityId,
    };

    it("does not require membership or an auth user", async () => {
      vi.mocked(getConversation).mockResolvedValue(externalConversation);
      vi.mocked(listRecentConversationMessages).mockResolvedValue([customerInbound]);
      const capturedInsert: { value: Record<string, unknown> | null } = {
        value: null,
      };
      mockInsert({
        capturedInsert,
        inserted: {
          id: AI_MSG_ID,
          author_type: "ai",
          author_user_id: null,
          direction: "outbound",
        },
      });

      const result = await processConversationMessage(
        ORG_A,
        CONV_1,
        { kind: "channel_ingress" },
        { provider: new MockAiProvider("Thanks for your message.") }
      );

      expect(result.outcome).toBe("responded");
      expect(requireOrgMembership).not.toHaveBeenCalled();
      expect(getConversation).toHaveBeenCalledWith(ORG_A, null, CONV_1);
      expect(buildAiContext).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_A,
          userId: null,
          conversationId: CONV_1,
          inboundMessageId: INBOUND_ID,
        })
      );
      expect(listRecentConversationMessages).toHaveBeenCalledWith(
        ORG_A,
        null,
        CONV_1,
        expect.any(Number)
      );
      expect(recordLeadActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_A,
          userId: null,
          leadId: LEAD_1,
        })
      );
    });

    it("still enforces organization scoping on the conversation", async () => {
      vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
      await expect(
        processConversationMessage(ORG_A, CONV_1, { kind: "channel_ingress" })
      ).rejects.toThrow(NotFoundError);
      expect(requireOrgMembership).not.toHaveBeenCalled();
      expect(getConversation).toHaveBeenCalledWith(ORG_A, null, CONV_1);
    });

    it("rejects channel_ingress when the conversation has no channel identity", async () => {
      await expect(
        processConversationMessage(ORG_A, CONV_1, { kind: "channel_ingress" })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(requireOrgMembership).not.toHaveBeenCalled();
    });

    it("uses existing eligibility to skip paused conversations without calling the provider", async () => {
      vi.mocked(getConversation).mockResolvedValue({
        ...externalConversation,
        ai_paused_at: "2026-08-27T10:00:00Z",
      });
      vi.mocked(listRecentConversationMessages).mockResolvedValue([customerInbound]);
      const { provider, generateResponse } = spyProvider();

      const result = await processConversationMessage(
        ORG_A,
        CONV_1,
        { kind: "channel_ingress" },
        { provider }
      );

      expect(result).toEqual({ outcome: "skipped", reason: "paused" });
      expect(generateResponse).not.toHaveBeenCalled();
      expect(requireOrgMembership).not.toHaveBeenCalled();
    });

    it("keeps operator membership required", async () => {
      vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
      await expect(
        processConversationMessage(ORG_A, CONV_1, {
          kind: "operator",
          userId: USER_1,
        })
      ).rejects.toThrow(TenantAccessError);
      expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
    });
  });
});
