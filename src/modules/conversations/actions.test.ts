/**
 * Conversation domain mutation tests.
 *
 * NO LIVE DATABASE. Supabase and requireOrgMembership are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  createConversation,
  updateConversation,
  createConversationMessage,
} from "@/modules/conversations/actions";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-4000-8000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

function makeConversation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "11111111-0000-4000-8000-0000000000aa",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    author_user_id: USER_1,
    author_type: "human",
    direction: "outbound",
    body: "Hello",
    in_reply_to_message_id: null,
    created_at: "2026-08-20T10:05:00Z",
    ...overrides,
  };
}

function mockForCreate({
  leadRow = { id: LEAD_1 },
  existingRow = null,
  insertedRow = null,
  insertError = null,
}: {
  leadRow?: Record<string, unknown> | null;
  existingRow?: Record<string, unknown> | null;
  insertedRow?: Record<string, unknown> | null;
  insertError?: { code?: string; message: string } | null;
} = {}) {
  const leadSingle = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadRow ? null : { message: "No rows" },
  });
  const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
  const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
  const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

  const maybeSingle = vi.fn().mockResolvedValue({
    data: existingRow,
    error: null,
  });
  const eqStatus = vi.fn().mockReturnValue({ maybeSingle });
  const eqChannel = vi.fn().mockReturnValue({ eq: eqStatus });
  const eqLead = vi.fn().mockReturnValue({ eq: eqChannel });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqLead });
  const existingSelect = vi.fn().mockReturnValue({ eq: eqOrg });

  let capturedInsert: Record<string, unknown> | null = null;
  const insertSingle = vi.fn().mockResolvedValue({
    data: insertedRow,
    error: insertError ?? (insertedRow ? null : { message: "Insert failed" }),
  });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInsert = payload;
    return { select: insertSelect };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: leadSelect };
      if (table === "conversations") return { select: existingSelect, insert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedInsert: () => capturedInsert, insert };
}

function mockForUpdate({
  row = null,
}: {
  row?: Record<string, unknown> | null;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: row,
    error: row ? null : { message: "No rows" },
  });
  const select = vi.fn().mockReturnValue({ single });
  const eqOrg = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const update = vi.fn().mockReturnValue({ eq: eqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { update, select: vi.fn() };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { update };
}

function mockForCreateMessage({
  conversationRow = makeConversation(),
  insertedMessage = null,
  insertError = null,
  bumpError = null,
}: {
  conversationRow?: Record<string, unknown> | null;
  insertedMessage?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
  bumpError?: { message: string } | null;
} = {}) {
  const convSingle = vi.fn().mockResolvedValue({
    data: conversationRow,
    error: conversationRow ? null : { message: "No rows" },
  });
  const convEqOrg = vi.fn().mockReturnValue({ single: convSingle });
  const convEqId = vi.fn().mockReturnValue({ eq: convEqOrg });
  const convSelect = vi.fn().mockReturnValue({ eq: convEqId });

  const bumpEqOrg = vi.fn().mockResolvedValue({ error: bumpError });
  const bumpEqId = vi.fn().mockReturnValue({ eq: bumpEqOrg });
  const convUpdate = vi.fn().mockReturnValue({ eq: bumpEqId });

  let capturedInsert: Record<string, unknown> | null = null;
  const msgSingle = vi.fn().mockResolvedValue({
    data: insertedMessage,
    error: insertError ?? (insertedMessage ? null : { message: "Insert failed" }),
  });
  const msgSelect = vi.fn().mockReturnValue({ single: msgSingle });
  const msgInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInsert = payload;
    return { select: msgSelect };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { select: convSelect, update: convUpdate };
      if (table === "messages") return { insert: msgInsert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedInsert: () => capturedInsert, convUpdate };
}

describe("createConversation — membership and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(TenantAccessError);
  });

  it("throws ValidationError for an invalid channel", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1, channel: "whatsapp" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when lead_id is missing", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(createConversation(ORG_A, USER_1, {})).rejects.toThrow(
      ValidationError
    );
  });
});

describe("createConversation — lead and tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws NotFoundError when the lead does not exist", async () => {
    mockForCreate({ leadRow: null });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when the lead belongs to another organization", async () => {
    mockForCreate({ leadRow: null });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(NotFoundError);
  });

  it("injects organization_id from verified context, not from input", async () => {
    const { getCapturedInsert } = mockForCreate({
      insertedRow: makeConversation(),
    });

    await createConversation(ORG_A, USER_1, {
      lead_id: LEAD_1,
      organization_id: ORG_B,
    });

    expect(getCapturedInsert()?.organization_id).toBe(ORG_A);
    expect(getCapturedInsert()?.lead_id).toBe(LEAD_1);
  });

  it("does not persist requires_human or ai_paused_at from the create payload", async () => {
    const { getCapturedInsert } = mockForCreate({
      insertedRow: makeConversation(),
    });

    await createConversation(ORG_A, USER_1, {
      lead_id: LEAD_1,
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });

    const payload = getCapturedInsert();
    expect(payload).toEqual({
      organization_id: ORG_A,
      lead_id: LEAD_1,
      channel: "in_app",
    });
    expect(payload).not.toHaveProperty("requires_human");
    expect(payload).not.toHaveProperty("ai_paused_at");
    expect(payload).not.toHaveProperty("status");
  });

  it("creates an in_app conversation for a same-org lead", async () => {
    mockForCreate({ insertedRow: makeConversation() });
    const result = await createConversation(ORG_A, USER_1, { lead_id: LEAD_1 });
    expect(result.organization_id).toBe(ORG_A);
    expect(result.channel).toBe("in_app");
  });
});

describe("createConversation — duplicate open conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws ConflictError when an open conversation already exists", async () => {
    mockForCreate({ existingRow: { id: CONV_1 } });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError on unique-index race (Postgres 23505)", async () => {
    mockForCreate({
      existingRow: null,
      insertError: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "conversations_one_open_in_app_per_lead"',
      },
    });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(ConflictError);
  });
});

describe("updateConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      updateConversation(ORG_A, USER_1, CONV_1, { status: "closed" })
    ).rejects.toThrow(TenantAccessError);
  });

  it("throws ValidationError for an invalid status", async () => {
    await expect(
      updateConversation(ORG_A, USER_1, CONV_1, { status: "archived" })
    ).rejects.toThrow(ValidationError);
  });

  it("updates status to closed", async () => {
    mockForUpdate({ row: makeConversation({ status: "closed" }) });
    const result = await updateConversation(ORG_A, USER_1, CONV_1, {
      status: "closed",
    });
    expect(result.status).toBe("closed");
  });

  it("throws NotFoundError when the conversation does not belong to the org", async () => {
    mockForUpdate({ row: null });
    await expect(
      updateConversation(ORG_A, USER_1, CONV_1, { status: "closed" })
    ).rejects.toThrow(NotFoundError);
  });

  it("does not apply requires_human from the client payload", async () => {
    const { update } = mockForUpdate({
      row: makeConversation({ requires_human: false }),
    });
    await updateConversation(ORG_A, USER_1, CONV_1, {
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00Z",
    });
    expect(update).toHaveBeenCalledWith({ status: "open" });
  });

  it("does not persist ai_paused_at from the client payload", async () => {
    const { update } = mockForUpdate({
      row: makeConversation({ ai_paused_at: null }),
    });
    await updateConversation(ORG_A, USER_1, CONV_1, {
      status: "closed",
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    expect(update).toHaveBeenCalledWith({ status: "closed" });
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("ai_paused_at");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("requires_human");
  });
});

describe("createConversationMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "Hi",
      })
    ).rejects.toThrow(TenantAccessError);
  });

  it("throws NotFoundError for a missing / cross-tenant conversation", async () => {
    mockForCreateMessage({ conversationRow: null });
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "Hi",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("creates an outbound message with author_user_id from the session", async () => {
    const { getCapturedInsert } = mockForCreateMessage({
      insertedMessage: makeMessage({ direction: "outbound" }),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "outbound",
      body: "Hello",
    });
    expect(getCapturedInsert()?.author_user_id).toBe(USER_1);
    expect(getCapturedInsert()?.author_type).toBe("human");
    expect(getCapturedInsert()?.organization_id).toBe(ORG_A);
    expect(getCapturedInsert()?.conversation_id).toBe(CONV_1);
    expect(getCapturedInsert()?.direction).toBe("outbound");
  });

  it("creates an inbound message with the authenticated author", async () => {
    const { getCapturedInsert } = mockForCreateMessage({
      insertedMessage: makeMessage({ direction: "inbound" }),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "inbound",
      body: "I am interested.",
    });
    expect(getCapturedInsert()?.direction).toBe("inbound");
    expect(getCapturedInsert()?.author_user_id).toBe(USER_1);
  });

  it("ignores forged author_user_id, organization_id, and conversation_id", async () => {
    const { getCapturedInsert } = mockForCreateMessage({
      insertedMessage: makeMessage(),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "outbound",
      body: "Hello",
      author_user_id: "ffffffff-0000-4000-8000-000000000099",
      organization_id: ORG_B,
      conversation_id: "dddddddd-0000-4000-8000-000000000002",
    });
    expect(getCapturedInsert()?.author_user_id).toBe(USER_1);
    expect(getCapturedInsert()?.organization_id).toBe(ORG_A);
    expect(getCapturedInsert()?.conversation_id).toBe(CONV_1);
  });

  it("does not write requires_human or ai_paused_at when creating a message", async () => {
    const { getCapturedInsert, convUpdate } = mockForCreateMessage({
      insertedMessage: makeMessage(),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "outbound",
      body: "Hello",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    expect(getCapturedInsert()).toEqual({
      organization_id: ORG_A,
      conversation_id: CONV_1,
      author_user_id: USER_1,
      author_type: "human",
      direction: "outbound",
      body: "Hello",
    });
    expect(convUpdate).toHaveBeenCalledWith({
      updated_at: expect.any(String),
    });
    expect(convUpdate.mock.calls[0]?.[0]).not.toHaveProperty("requires_human");
    expect(convUpdate.mock.calls[0]?.[0]).not.toHaveProperty("ai_paused_at");
  });

  it("throws ValidationError for an empty body", async () => {
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for a whitespace-only body", async () => {
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "   ",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for a body over 4000 characters", async () => {
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "x".repeat(4001),
      })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for an invalid direction", async () => {
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "sideways",
        body: "Hello",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("bumps the parent conversation updated_at after insert", async () => {
    const { convUpdate } = mockForCreateMessage({
      insertedMessage: makeMessage(),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "outbound",
      body: "Hello",
    });
    expect(convUpdate).toHaveBeenCalled();
  });
});

describe("createConversation — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records one conversation-started activity after a successful create", async () => {
    mockForCreate({ insertedRow: makeConversation() });
    await createConversation(ORG_A, USER_1, { lead_id: LEAD_1 });
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "conversation",
      content: "Conversation started",
    });
  });

  it("does not record an activity when conversation creation fails", async () => {
    mockForCreate({ insertError: { message: "insert failed" } });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(/Failed to create conversation/);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a duplicate open conversation", async () => {
    mockForCreate({ existingRow: { id: CONV_1 } });
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow(ConflictError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("surfaces activity recording failure after the conversation exists", async () => {
    mockForCreate({ insertedRow: makeConversation() });
    vi.mocked(recordLeadActivity).mockRejectedValue(new Error("activity failed"));
    await expect(
      createConversation(ORG_A, USER_1, { lead_id: LEAD_1 })
    ).rejects.toThrow("activity failed");
  });
});

describe("createConversationMessage — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records exactly one outbound activity without copying the message body", async () => {
    mockForCreateMessage({
      insertedMessage: makeMessage({ direction: "outbound", body: "SECRET BODY" }),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "outbound",
      body: "SECRET BODY",
    });
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "conversation",
      content: "Outbound message sent",
    });
    expect(vi.mocked(recordLeadActivity).mock.calls[0]?.[0].content).not.toContain(
      "SECRET BODY"
    );
  });

  it("records inbound message activity with the authenticated user_id", async () => {
    mockForCreateMessage({
      insertedMessage: makeMessage({ direction: "inbound" }),
    });
    await createConversationMessage(ORG_A, USER_1, CONV_1, {
      direction: "inbound",
      body: "I am interested.",
    });
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "conversation",
      content: "Inbound message received",
    });
  });

  it("does not record an activity when message creation fails", async () => {
    mockForCreateMessage({ insertError: { message: "insert failed" } });
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "Hello",
      })
    ).rejects.toThrow(/Failed to create message/);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a cross-tenant conversation", async () => {
    mockForCreateMessage({ conversationRow: null });
    await expect(
      createConversationMessage(ORG_A, USER_1, CONV_1, {
        direction: "outbound",
        body: "Hello",
      })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});
