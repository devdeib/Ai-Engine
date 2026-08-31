/**
 * Tests for:
 *   GET  /api/v1/organizations/:organizationId/conversations/:conversationId/messages
 *   POST /api/v1/organizations/:organizationId/conversations/:conversationId/messages
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type {
  MessageWithDeliveryStatus,
  OrganizationMember,
} from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/conversations/queries", () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  listConversationMessages: vi.fn(),
}));

vi.mock("@/modules/conversations/actions", () => ({
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  createConversationMessage: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listConversationMessages } from "@/modules/conversations/queries";
import { createConversationMessage } from "@/modules/conversations/actions";
import { GET, POST, MESSAGE_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";
const INVALID_UUID = "not-a-uuid";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/messages`;

const mockUser = { id: USER_1, email: "user@example.com" } as unknown as User;

const mockMember: OrganizationMember = {
  id: "ffffffff-0000-0000-0000-000000000001",
  organization_id: ORG_A,
  user_id: USER_1,
  role: "owner",
  invited_by: null,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};

const mockOrgContext = { user: mockUser, member: mockMember, organizationId: ORG_A };

function makeMessage(
  overrides: Partial<MessageWithDeliveryStatus> = {}
): MessageWithDeliveryStatus {
  const direction = overrides.direction ?? "outbound";
  return {
    id: MSG_1,
    organization_id: ORG_A,
    conversation_id: CONV_1,
    author_user_id: USER_1,
    author_type: "human",
    direction,
    body: "Hello",
    in_reply_to_message_id: null,
    channel_identity_id: null,
    created_at: "2026-08-20T10:05:00Z",
    delivery_status: direction === "inbound" ? null : "not_applicable",
    ...overrides,
  };
}

function makeGetRequest(
  path: string,
  searchParams?: Record<string, string>
): NextRequest {
  const url = new URL(`http://localhost:3000${path}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

function makePostRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId: string = ORG_A, conversationId: string = CONV_1) {
  return { params: Promise.resolve({ organizationId, conversationId }) };
}

describe("GET /conversations/:conversationId/messages — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(403);
  });
});

describe("GET /conversations/:conversationId/messages — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the conversationId is not a valid UUID", async () => {
    const res = await GET(
      makeGetRequest(
        `/api/v1/organizations/${ORG_A}/conversations/${INVALID_UUID}/messages`
      ),
      makeContext(ORG_A, INVALID_UUID)
    );

    expect(res.status).toBe(422);
    expect(listConversationMessages).not.toHaveBeenCalled();
  });
});

describe("GET /conversations/:conversationId/messages — pagination validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("rejects limit > 100 with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { limit: "101" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listConversationMessages).not.toHaveBeenCalled();
  });

  it("rejects page < 1 with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { page: "0" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listConversationMessages).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric limit with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { limit: "abc" }),
      makeContext()
    );

    expect(res.status).toBe(422);
  });
});

describe("GET /conversations/:conversationId/messages — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with messages and pagination metadata", async () => {
    const older = makeMessage({
      id: "11111111-0000-4000-8000-0000000000aa",
      body: "First",
      created_at: "2026-08-20T10:00:00Z",
    });
    const newer = makeMessage({
      id: "11111111-0000-4000-8000-0000000000bb",
      body: "Second",
      created_at: "2026-08-20T10:05:00Z",
    });
    vi.mocked(listConversationMessages).mockResolvedValue([older, newer]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].body).toBe("First");
    expect(body.data[1].body).toBe("Second");
    expect(body.meta).toMatchObject({ page: 1, limit: 20, count: 2 });
  });

  it("returns delivery_status on listed messages and omits provider internals", async () => {
    const queued: MessageWithDeliveryStatus = {
      ...makeMessage(),
      delivery_status: "queued",
    };
    vi.mocked(listConversationMessages).mockResolvedValue([queued]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data[0].delivery_status).toBe("queued");
    expect(body.data[0].provider_error_code).toBeUndefined();
    expect(body.data[0].last_error_code).toBeUndefined();
    expect(body.data[0]).not.toHaveProperty("webhookSecret");
  });

  it("returns empty array and zero count when there are no messages", async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
  });

  it("applies default pagination when no params are provided", async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(listConversationMessages).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1, {
      page: MESSAGE_PAGINATION_DEFAULTS.page,
      limit: MESSAGE_PAGINATION_DEFAULTS.limit,
    });
  });

  it("passes explicit page and limit to listConversationMessages", async () => {
    vi.mocked(listConversationMessages).mockResolvedValue([]);

    await GET(
      makeGetRequest(BASE_PATH, { page: "2", limit: "10" }),
      makeContext()
    );

    expect(listConversationMessages).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1, {
      page: 2,
      limit: 10,
    });
  });

  it("returns 404 when the conversation is missing or belongs to another tenant", async () => {
    vi.mocked(listConversationMessages).mockRejectedValue(
      new NotFoundError("Conversation")
    );

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a cross-tenant conversationId (no existence leakage)", async () => {
    vi.mocked(listConversationMessages).mockRejectedValue(
      new NotFoundError("Conversation")
    );

    const res = await GET(makeGetRequest(BASE_PATH), makeContext(ORG_B, CONV_1));

    expect(res.status).toBe(404);
  });
});

describe("POST /conversations/:conversationId/messages — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(401);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(403);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });
});

describe("POST /conversations/:conversationId/messages — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the conversationId is not a valid UUID", async () => {
    const req = makePostRequest(
      `/api/v1/organizations/${ORG_A}/conversations/${INVALID_UUID}/messages`,
      { direction: "outbound", body: "Hello" }
    );
    const res = await POST(req, makeContext(ORG_A, INVALID_UUID));

    expect(res.status).toBe(422);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });
});

describe("POST /conversations/:conversationId/messages — successful creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 201 with the created outbound message", async () => {
    vi.mocked(createConversationMessage).mockResolvedValue(makeMessage());

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
    });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.body).toBe("Hello");
    expect(body.data.direction).toBe("outbound");
  });

  it("returns 201 with the created inbound message", async () => {
    vi.mocked(createConversationMessage).mockResolvedValue(
      makeMessage({ direction: "inbound", body: "I am interested." })
    );

    const req = makePostRequest(BASE_PATH, {
      direction: "inbound",
      body: "I am interested.",
    });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.direction).toBe("inbound");
  });

  it("passes verified organizationId, userId, and conversationId — identity fields cannot override context", async () => {
    vi.mocked(createConversationMessage).mockResolvedValue(makeMessage());

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
      author_user_id: "ffffffff-0000-4000-8000-000000000099",
      organization_id: ORG_B,
      conversation_id: "dddddddd-0000-4000-8000-000000000002",
    });
    await POST(req, makeContext());

    expect(createConversationMessage).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      expect.not.objectContaining({
        author_user_id: expect.anything(),
        organization_id: expect.anything(),
        conversation_id: expect.anything(),
      })
    );
  });

  it("strips requires_human and ai_paused_at from the message body", async () => {
    vi.mocked(createConversationMessage).mockResolvedValue(makeMessage());

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    await POST(req, makeContext());

    expect(createConversationMessage).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      expect.objectContaining({ direction: "outbound", body: "Hello" })
    );
    expect(createConversationMessage).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      expect.not.objectContaining({
        requires_human: expect.anything(),
        ai_paused_at: expect.anything(),
      })
    );
  });
});

describe("POST /conversations/:conversationId/messages — validation and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for an empty body", async () => {
    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 422 for a whitespace-only body", async () => {
    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "   ",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 422 for a body over 4000 characters", async () => {
    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "x".repeat(4001),
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid direction", async () => {
    const req = makePostRequest(BASE_PATH, {
      direction: "sideways",
      body: "Hello",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 422 when the request body is not valid JSON", async () => {
    const req = new NextRequest(`http://localhost:3000${BASE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
  });

  it("returns 404 when the conversation is missing or belongs to another tenant", async () => {
    vi.mocked(createConversationMessage).mockRejectedValue(
      new NotFoundError("Conversation")
    );

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(404);
  });

  it("returns 404 for a cross-tenant POST (no existence leakage)", async () => {
    vi.mocked(createConversationMessage).mockRejectedValue(
      new NotFoundError("Conversation")
    );

    const req = makePostRequest(BASE_PATH, {
      direction: "outbound",
      body: "Hello",
    });
    const res = await POST(req, makeContext(ORG_B, CONV_1));

    expect(res.status).toBe(404);
  });
});
