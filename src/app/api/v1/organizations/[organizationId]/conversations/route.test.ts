/**
 * Tests for:
 *   GET  /api/v1/organizations/:organizationId/conversations
 *   POST /api/v1/organizations/:organizationId/conversations
 *
 * Strategy: mock the auth layer and domain functions; test the HTTP boundary
 * (request parsing, validation, response shape, status codes).
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { ConversationWithLead, OrganizationMember } from "@/lib/db/types";
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
import { listConversations } from "@/modules/conversations/queries";
import { createConversation } from "@/modules/conversations/actions";
import { GET, POST, CONVERSATION_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations`;

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

function makeConversation(
  overrides: Partial<ConversationWithLead> = {}
): ConversationWithLead {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: null,
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

function makeContext(organizationId: string = ORG_A) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("GET /organizations/:organizationId/conversations — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(403);
  });

  it("passes the URL organizationId to getOrgContext for membership verification", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listConversations).mockResolvedValue([]);

    const req = makeGetRequest(BASE_PATH);
    await GET(req, makeContext(ORG_A));

    expect(getOrgContext).toHaveBeenCalledWith(req, ORG_A);
  });
});

describe("GET /organizations/:organizationId/conversations — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the conversation collection and pagination metadata", async () => {
    const rows = [makeConversation(), makeConversation({ id: "cccccccc-0000-4000-8000-000000000002" })];
    vi.mocked(listConversations).mockResolvedValue(rows);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].lead.first_name).toBe("Ahmed");
    expect(body.meta).toMatchObject({ page: 1, limit: 20, count: 2 });
  });

  it("returns empty array and zero count when the org has no conversations", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
  });

  it("applies default pagination when no params are provided", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(listConversations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      {
        page: CONVERSATION_PAGINATION_DEFAULTS.page,
        limit: CONVERSATION_PAGINATION_DEFAULTS.limit,
      },
      {}
    );
  });

  it("passes explicit page and limit to listConversations", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    await GET(
      makeGetRequest(BASE_PATH, { page: "2", limit: "10" }),
      makeContext()
    );

    expect(listConversations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 2, limit: 10 },
      {}
    );
  });

  it("reflects pagination params in the meta response", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    const res = await GET(
      makeGetRequest(BASE_PATH, { page: "3", limit: "5" }),
      makeContext()
    );
    const body = await res.json();

    expect(body.meta).toMatchObject({ page: 3, limit: 5 });
  });

  it("passes status filter to listConversations", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { status: "open" }), makeContext());

    expect(listConversations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { status: "open" }
    );
  });

  it("passes lead_id filter to listConversations", async () => {
    vi.mocked(listConversations).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { lead_id: LEAD_1 }), makeContext());

    expect(listConversations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { leadId: LEAD_1 }
    );
  });
});

describe("GET /organizations/:organizationId/conversations — query validation", () => {
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
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("rejects page < 1 with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { page: "0" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric limit with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { limit: "abc" }),
      makeContext()
    );

    expect(res.status).toBe(422);
  });

  it("rejects an invalid status enum with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { status: "archived" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listConversations).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID lead_id with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { lead_id: "not-a-uuid" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listConversations).not.toHaveBeenCalled();
  });
});

describe("POST /organizations/:organizationId/conversations — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const req = makePostRequest(BASE_PATH, { lead_id: LEAD_1 });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(401);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const req = makePostRequest(BASE_PATH, { lead_id: LEAD_1 });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(403);
    expect(createConversation).not.toHaveBeenCalled();
  });
});

describe("POST /organizations/:organizationId/conversations — successful creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 201 with the created conversation", async () => {
    const conversation = makeConversation();
    vi.mocked(createConversation).mockResolvedValue(conversation);

    const req = makePostRequest(BASE_PATH, { lead_id: LEAD_1 });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe(CONV_1);
    expect(body.data.channel).toBe("in_app");
  });

  it("passes verified organizationId and userId into the domain, not client identity fields", async () => {
    vi.mocked(createConversation).mockResolvedValue(makeConversation());

    const req = makePostRequest(BASE_PATH, {
      lead_id: LEAD_1,
      organization_id: ORG_B,
      user_id: "ffffffff-0000-4000-8000-000000000099",
    });
    await POST(req, makeContext());

    expect(createConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.not.objectContaining({ organization_id: expect.anything() })
    );
    expect(createConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.objectContaining({ lead_id: LEAD_1 })
    );
  });

  it("strips requires_human and ai_paused_at from the create body", async () => {
    vi.mocked(createConversation).mockResolvedValue(makeConversation());

    const req = makePostRequest(BASE_PATH, {
      lead_id: LEAD_1,
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00.000Z",
    });
    await POST(req, makeContext());

    expect(createConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.objectContaining({ lead_id: LEAD_1, channel: "in_app" })
    );
    expect(createConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.not.objectContaining({
        requires_human: expect.anything(),
        ai_paused_at: expect.anything(),
        status: expect.anything(),
      })
    );
  });
});

describe("POST /organizations/:organizationId/conversations — validation and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when lead_id is missing", async () => {
    const req = makePostRequest(BASE_PATH, { channel: "in_app" });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversation).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid channel", async () => {
    const req = makePostRequest(BASE_PATH, {
      lead_id: LEAD_1,
      channel: "whatsapp",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createConversation).not.toHaveBeenCalled();
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

  it("returns 404 when the lead is missing or belongs to another tenant", async () => {
    vi.mocked(createConversation).mockRejectedValue(new NotFoundError("Lead"));

    const req = makePostRequest(BASE_PATH, { lead_id: LEAD_1 });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 409 when an open in_app conversation already exists for the lead", async () => {
    vi.mocked(createConversation).mockRejectedValue(
      new ConflictError("An open conversation already exists for this lead")
    );

    const req = makePostRequest(BASE_PATH, { lead_id: LEAD_1 });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });
});
