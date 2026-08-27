/**
 * Conversation domain query tests.
 *
 * NO LIVE DATABASE. Supabase and requireOrgMembership are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  listConversations,
  getConversation,
  listConversationMessages,
  listRecentConversationMessages,
} from "@/modules/conversations/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
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
    channel_account_id: null,
    channel_identity_id: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T11:00:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
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
    channel_identity_id: null,
    created_at: "2026-08-20T10:05:00Z",
    ...overrides,
  };
}

function mockListConversations({
  rows = [],
  error = null,
}: {
  rows?: Record<string, unknown>[];
  error?: { message: string } | null;
} = {}) {
  const range = vi.fn().mockResolvedValue({ data: rows, error });
  const orderId = vi.fn().mockReturnValue({ range });
  const orderUpdated = vi.fn().mockReturnValue({ order: orderId });
  const filterChain: {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    order: orderUpdated,
  };
  filterChain.eq.mockReturnValue(filterChain);
  const select = vi.fn().mockReturnValue(filterChain);

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { filterChain, orderUpdated, orderId, range, select };
}

function mockGetConversation({
  row = null,
}: {
  row?: Record<string, unknown> | null;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: row,
    error: row ? null : { message: "No rows" },
  });
  const eqOrg = vi.fn().mockReturnValue({ single });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const select = vi.fn().mockReturnValue({ eq: eqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { eqId, eqOrg };
}

function mockListMessages({
  conversationRow = makeConversation(),
  messages = [],
  messagesError = null,
}: {
  conversationRow?: Record<string, unknown> | null;
  messages?: Record<string, unknown>[];
  messagesError?: { message: string } | null;
} = {}) {
  const convSingle = vi.fn().mockResolvedValue({
    data: conversationRow,
    error: conversationRow ? null : { message: "No rows" },
  });
  const convEqOrg = vi.fn().mockReturnValue({ single: convSingle });
  const convEqId = vi.fn().mockReturnValue({ eq: convEqOrg });
  const convSelect = vi.fn().mockReturnValue({ eq: convEqId });

  const range = vi.fn().mockResolvedValue({ data: messages, error: messagesError });
  const orderId = vi.fn().mockReturnValue({ range });
  const orderCreated = vi.fn().mockReturnValue({ order: orderId });
  const eqConv = vi.fn().mockReturnValue({ order: orderCreated });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqConv });
  const msgSelect = vi.fn().mockReturnValue({ eq: eqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { select: convSelect };
      if (table === "messages") return { select: msgSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { orderCreated, orderId, range };
}

function mockListRecentMessages({
  conversationRow = makeConversation(),
  messages = [],
}: {
  conversationRow?: Record<string, unknown> | null;
  messages?: Record<string, unknown>[];
} = {}) {
  const convSingle = vi.fn().mockResolvedValue({
    data: conversationRow,
    error: conversationRow ? null : { message: "No rows" },
  });
  const convEqOrg = vi.fn().mockReturnValue({ single: convSingle });
  const convEqId = vi.fn().mockReturnValue({ eq: convEqOrg });
  const convSelect = vi.fn().mockReturnValue({ eq: convEqId });

  const limit = vi.fn().mockResolvedValue({ data: messages, error: null });
  const orderId = vi.fn().mockReturnValue({ limit });
  const orderCreated = vi.fn().mockReturnValue({ order: orderId });
  const eqConv = vi.fn().mockReturnValue({ order: orderCreated });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqConv });
  const msgSelect = vi.fn().mockReturnValue({ eq: eqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") return { select: convSelect };
      if (table === "messages") return { select: msgSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { orderCreated, orderId, limit };
}

describe("listConversations — membership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listConversations(ORG_A, USER_1)).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("listConversations — retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns an empty array when there are no conversations", async () => {
    mockListConversations({ rows: [] });
    await expect(listConversations(ORG_A, USER_1)).resolves.toEqual([]);
  });

  it("returns conversations for the organization", async () => {
    const row = makeConversation();
    mockListConversations({ rows: [row] });
    const result = await listConversations(ORG_A, USER_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(CONV_1);
  });

  it("embeds lead display fields on each conversation", async () => {
    mockListConversations({ rows: [makeConversation()] });
    const result = await listConversations(ORG_A, USER_1);
    expect(result[0]?.lead).toEqual({
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    });
  });

  it("selects the lead embed rather than conversation columns alone", async () => {
    const { select } = mockListConversations();
    await listConversations(ORG_A, USER_1);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("lead:leads"));
  });

  it("orders by updated_at DESC then id DESC", async () => {
    const { orderUpdated, orderId } = mockListConversations();
    await listConversations(ORG_A, USER_1);
    expect(orderUpdated).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("applies pagination offsets", async () => {
    const { range } = mockListConversations();
    await listConversations(ORG_A, USER_1, { page: 3, limit: 10 });
    expect(range).toHaveBeenCalledWith(20, 29);
  });

  it("filters by status when provided", async () => {
    const { filterChain } = mockListConversations();
    await listConversations(ORG_A, USER_1, { page: 1, limit: 20 }, { status: "open" });
    expect(filterChain.eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by leadId when provided", async () => {
    const { filterChain } = mockListConversations();
    await listConversations(ORG_A, USER_1, { page: 1, limit: 20 }, { leadId: LEAD_1 });
    expect(filterChain.eq).toHaveBeenCalledWith("lead_id", LEAD_1);
  });

  it("propagates a database error", async () => {
    mockListConversations({ error: { message: "DB error" } });
    await expect(listConversations(ORG_A, USER_1)).rejects.toThrow(
      "Failed to fetch conversations"
    );
  });
});

describe("getConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(getConversation(ORG_A, USER_1, CONV_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("returns the conversation when it belongs to the organization", async () => {
    mockGetConversation({ row: makeConversation() });
    const result = await getConversation(ORG_A, USER_1, CONV_1);
    expect(result.id).toBe(CONV_1);
  });

  it("throws NotFoundError when the conversation is missing", async () => {
    mockGetConversation({ row: null });
    await expect(getConversation(ORG_A, USER_1, CONV_1)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for a cross-tenant conversation id", async () => {
    mockGetConversation({ row: null });
    await expect(getConversation(ORG_A, USER_1, CONV_1)).rejects.toThrow(NotFoundError);
  });
});

describe("listConversationMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listConversationMessages(ORG_A, USER_1, CONV_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("throws NotFoundError when the conversation does not belong to the org", async () => {
    mockListMessages({ conversationRow: null });
    await expect(listConversationMessages(ORG_A, USER_1, CONV_1)).rejects.toThrow(
      NotFoundError
    );
  });

  it("returns an empty array when there are no messages", async () => {
    mockListMessages({ messages: [] });
    await expect(listConversationMessages(ORG_A, USER_1, CONV_1)).resolves.toEqual([]);
  });

  it("returns messages for the conversation", async () => {
    mockListMessages({ messages: [makeMessage()] });
    const result = await listConversationMessages(ORG_A, USER_1, CONV_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.body).toBe("Hello");
  });

  it("orders messages oldest-first (created_at ASC, id ASC)", async () => {
    const { orderCreated, orderId } = mockListMessages();
    await listConversationMessages(ORG_A, USER_1, CONV_1);
    expect(orderCreated).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("applies pagination offsets", async () => {
    const { range } = mockListMessages();
    await listConversationMessages(ORG_A, USER_1, CONV_1, { page: 2, limit: 20 });
    expect(range).toHaveBeenCalledWith(20, 39);
  });
});

describe("listRecentConversationMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws NotFoundError when the conversation does not belong to the org", async () => {
    mockListRecentMessages({ conversationRow: null });
    await expect(
      listRecentConversationMessages(ORG_A, USER_1, CONV_1)
    ).rejects.toThrow(NotFoundError);
  });

  it("returns newest-first rows reversed into chronological order", async () => {
    const newest = makeMessage({ id: "n", created_at: "2026-08-20T12:00:00Z" });
    const oldest = makeMessage({ id: "o", created_at: "2026-08-20T11:00:00Z" });
    mockListRecentMessages({ messages: [newest, oldest] });
    const result = await listRecentConversationMessages(ORG_A, USER_1, CONV_1, 20);
    expect(result.map((row) => row.id)).toEqual(["o", "n"]);
  });

  it("orders by created_at DESC then id DESC and applies limit", async () => {
    const { orderCreated, orderId, limit } = mockListRecentMessages();
    await listRecentConversationMessages(ORG_A, USER_1, CONV_1, 12);
    expect(orderCreated).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: false });
    expect(limit).toHaveBeenCalledWith(12);
  });
});
