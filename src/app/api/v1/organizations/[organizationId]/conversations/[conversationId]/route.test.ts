/**
 * Tests for:
 *   GET   /api/v1/organizations/:organizationId/conversations/:conversationId
 *   PATCH /api/v1/organizations/:organizationId/conversations/:conversationId
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
import { getConversation } from "@/modules/conversations/queries";
import { updateConversation } from "@/modules/conversations/actions";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INVALID_UUID = "not-a-uuid";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations/${CONV_1}`;

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

function makeGetRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`);
}

function makePatchRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId: string = ORG_A, conversationId: string = CONV_1) {
  return { params: Promise.resolve({ organizationId, conversationId }) };
}

describe("GET /conversations/:conversationId — authentication", () => {
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

describe("GET /conversations/:conversationId — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the conversationId is not a valid UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/conversations/${INVALID_UUID}`),
      makeContext(ORG_A, INVALID_UUID)
    );

    expect(res.status).toBe(422);
    expect(getConversation).not.toHaveBeenCalled();
  });
});

describe("GET /conversations/:conversationId — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the conversation when it belongs to the org", async () => {
    vi.mocked(getConversation).mockResolvedValue(makeConversation());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(CONV_1);
    expect(body.data.organization_id).toBe(ORG_A);
  });

  it("passes verified organizationId and userId into getConversation", async () => {
    vi.mocked(getConversation).mockResolvedValue(makeConversation());

    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(getConversation).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1);
  });

  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a cross-tenant conversation (no existence leakage)", async () => {
    vi.mocked(getConversation).mockRejectedValue(new NotFoundError("Conversation"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext(ORG_B, CONV_1));

    expect(res.status).toBe(404);
  });
});

describe("PATCH /conversations/:conversationId — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const req = makePatchRequest(BASE_PATH, { status: "closed" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const req = makePatchRequest(BASE_PATH, { status: "closed" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(403);
  });
});

describe("PATCH /conversations/:conversationId — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the conversationId is not a valid UUID", async () => {
    const req = makePatchRequest(
      `/api/v1/organizations/${ORG_A}/conversations/${INVALID_UUID}`,
      { status: "closed" }
    );
    const res = await PATCH(req, makeContext(ORG_A, INVALID_UUID));

    expect(res.status).toBe(422);
    expect(updateConversation).not.toHaveBeenCalled();
  });
});

describe("PATCH /conversations/:conversationId — successful update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the updated conversation", async () => {
    vi.mocked(updateConversation).mockResolvedValue(
      makeConversation({ status: "closed" })
    );

    const req = makePatchRequest(BASE_PATH, { status: "closed" });
    const res = await PATCH(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("closed");
  });

  it("passes verified organizationId, userId, and conversationId into the domain", async () => {
    vi.mocked(updateConversation).mockResolvedValue(makeConversation());

    const req = makePatchRequest(BASE_PATH, { status: "open" });
    await PATCH(req, makeContext());

    expect(updateConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      { status: "open" }
    );
  });

  it("strips organization_id, lead_id, and handoff fields from the body", async () => {
    vi.mocked(updateConversation).mockResolvedValue(makeConversation());

    const req = makePatchRequest(BASE_PATH, {
      status: "closed",
      organization_id: ORG_B,
      lead_id: LEAD_1,
      channel: "in_app",
      requires_human: true,
      ai_paused_at: "2026-08-20T12:00:00Z",
    });
    await PATCH(req, makeContext());

    expect(updateConversation).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      expect.not.objectContaining({
        organization_id: expect.anything(),
        lead_id: expect.anything(),
        requires_human: expect.anything(),
        ai_paused_at: expect.anything(),
      })
    );
  });
});

describe("PATCH /conversations/:conversationId — validation and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for an invalid status", async () => {
    const req = makePatchRequest(BASE_PATH, { status: "archived" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(422);
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it("returns 422 when the request body is not valid JSON", async () => {
    const req = new NextRequest(`http://localhost:3000${BASE_PATH}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(422);
  });

  it("returns 404 when the conversation does not exist", async () => {
    vi.mocked(updateConversation).mockRejectedValue(new NotFoundError("Conversation"));

    const req = makePatchRequest(BASE_PATH, { status: "closed" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(404);
  });

  it("returns 404 for a cross-tenant conversation (no info leakage)", async () => {
    vi.mocked(updateConversation).mockRejectedValue(new NotFoundError("Conversation"));

    const req = makePatchRequest(BASE_PATH, { status: "closed" });
    const res = await PATCH(req, makeContext(ORG_B, CONV_1));

    expect(res.status).toBe(404);
  });
});
