/**
 * AI execution service tests. LLM is always a mock. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError, TenantAccessError } from "@/lib/errors";

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

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  getConversation,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";
import { buildAiContext } from "@/modules/ai/context";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { processConversationMessage } from "@/modules/ai/service";
import { MockAiProvider } from "@/modules/ai/providers/mock";
import { AiProviderError } from "@/modules/ai/errors";
import type { AiContext } from "@/modules/ai/types";
import type { ConversationWithLead, Message } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND_ID = "11111111-0000-4000-8000-0000000000aa";
const AI_MSG_ID = "22222222-0000-4000-8000-0000000000bb";

const conversation: ConversationWithLead = {
  id: CONV_1,
  organization_id: ORG_A,
  lead_id: LEAD_1,
  channel: "in_app",
  status: "open",
  requires_human: false,
  ai_paused_at: null,
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
  created_at: "2026-08-21T10:00:00Z",
};

const aiContext: AiContext = {
  organization: { name: "Acme" },
  lead: {
    firstName: "Ahmed",
    lastName: "Ali",
    companyName: null,
    email: null,
    phone: null,
    status: "new",
    score: null,
    notes: null,
  },
  conversation: {
    channel: "in_app",
    status: "open",
    requiresHuman: false,
    aiPausedAt: null,
  },
  messages: [],
  followUps: [],
  appointments: [],
  recentActivities: [],
};

function mockInsert({
  inserted,
  insertError,
  capturedInsert,
}: {
  inserted: Record<string, unknown> | null;
  insertError?: { code?: string; message: string } | null;
  capturedInsert: { value: Record<string, unknown> | null };
}) {
  const insertSingle = vi.fn().mockResolvedValue({
    data: inserted,
    error: insertError ?? (inserted ? null : { message: "Insert failed" }),
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
}

describe("processConversationMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    vi.mocked(listRecentConversationMessages).mockResolvedValue([inbound]);
    vi.mocked(buildAiContext).mockResolvedValue(aiContext);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("rejects unauthenticated org access", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      processConversationMessage(ORG_A, USER_1, CONV_1, {
        provider: new MockAiProvider("Hi"),
      })
    ).rejects.toThrow(TenantAccessError);
  });

  it("rejects a cross-tenant conversation", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));
    await expect(
      processConversationMessage(ORG_A, USER_1, CONV_1, {
        provider: new MockAiProvider("Hi"),
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("skips when the conversation is closed", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      status: "closed",
    });
    const result = await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Hi"),
    });
    expect(result).toEqual({ outcome: "skipped", reason: "closed" });
    expect(buildAiContext).not.toHaveBeenCalled();
  });

  it("skips when AI is paused", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      ai_paused_at: "2026-08-21T12:00:00Z",
    });
    const result = await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Hi"),
    });
    expect(result).toEqual({ outcome: "skipped", reason: "paused" });
  });

  it("skips when requires_human is true", async () => {
    vi.mocked(getConversation).mockResolvedValue({
      ...conversation,
      requires_human: true,
    });
    const result = await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Hi"),
    });
    expect(result).toEqual({ outcome: "skipped", reason: "requires_human" });
  });

  it("skips when the latest message is outbound", async () => {
    vi.mocked(listRecentConversationMessages).mockResolvedValue([
      inbound,
      { ...inbound, id: "out", direction: "outbound" },
    ]);
    const result = await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Hi"),
    });
    expect(result).toEqual({ outcome: "skipped", reason: "latest_outbound" });
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

    const result = await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Thanks for your message."),
    });

    expect(result).toEqual({ outcome: "responded", messageId: AI_MSG_ID });
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
  });

  it("maps a unique-constraint race to ConflictError", async () => {
    mockInsert({
      capturedInsert: { value: null },
      inserted: null,
      insertError: { code: "23505", message: "duplicate key" },
    });

    await expect(
      processConversationMessage(ORG_A, USER_1, CONV_1, {
        provider: new MockAiProvider("Hi"),
      })
    ).rejects.toThrow(ConflictError);
  });

  it("does not persist a message when the provider fails", async () => {
    const failing: { generateResponse: () => Promise<never> } = {
      generateResponse: async () => {
        throw new AiProviderError();
      },
    };
    const capturedInsert: { value: Record<string, unknown> | null } = {
      value: null,
    };
    mockInsert({ capturedInsert, inserted: { id: AI_MSG_ID } });

    await expect(
      processConversationMessage(ORG_A, USER_1, CONV_1, {
        provider: failing as never,
      })
    ).rejects.toThrow(AiProviderError);
    expect(capturedInsert.value).toBeNull();
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

    await processConversationMessage(ORG_A, USER_1, CONV_1, {
      provider: new MockAiProvider("Hi there."),
    });

    expect(capturedInsert.value?.author_type).toBe("ai");
    expect(capturedInsert.value?.author_user_id).toBeNull();
    expect(capturedInsert.value?.organization_id).toBe(ORG_A);
  });
});
