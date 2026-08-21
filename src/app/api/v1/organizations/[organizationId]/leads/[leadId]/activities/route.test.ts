/**
 * Tests for:
 *   GET  /api/v1/organizations/:organizationId/leads/:leadId/activities
 *   POST /api/v1/organizations/:organizationId/leads/:leadId/activities
 *
 * Strategy: mock the auth layer and domain functions; test the HTTP boundary
 * (request parsing, validation, response shape, status codes).
 * Domain logic is covered by queries.test.ts.
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError, NotFoundError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember, LeadActivity } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/leads/activities/queries", () => ({
  listLeadActivities: vi.fn(),
  createLeadActivity: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listLeadActivities, createLeadActivity } from "@/modules/leads/activities/queries";
import { GET, POST, ACTIVITY_PAGINATION_DEFAULTS } from "./route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const INVALID_LEAD_ID = "not-a-uuid";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads/${LEAD_ID}/activities`;

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

function makeActivity(overrides: Partial<LeadActivity> = {}): LeadActivity {
  return {
    id: "activ111-0000-0000-0000-000000000001",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    user_id: USER_1,
    type: "note",
    content: "Called the lead — very interested.",
    created_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function makeGetRequest(path: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: "GET" });
}

function makePostRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(leadId = LEAD_ID) {
  return {
    params: Promise.resolve({ organizationId: ORG_A, leadId }),
  };
}

// ---------------------------------------------------------------------------
// GET — authentication
// ---------------------------------------------------------------------------

describe("GET /activities — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 401 when the user is not authenticated", async () => {
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

// ---------------------------------------------------------------------------
// GET — leadId validation
// ---------------------------------------------------------------------------

describe("GET /activities — leadId validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for an invalid (non-UUID) leadId", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/leads/${INVALID_LEAD_ID}/activities`),
      makeContext(INVALID_LEAD_ID)
    );

    expect(res.status).toBe(422);
    expect(listLeadActivities).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET — pagination validation
// ---------------------------------------------------------------------------

describe("GET /activities — pagination validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listLeadActivities).mockResolvedValue([]);
  });

  it("uses default page=1 and limit=20 when not supplied", async () => {
    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(listLeadActivities).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      { page: ACTIVITY_PAGINATION_DEFAULTS.page, limit: ACTIVITY_PAGINATION_DEFAULTS.limit }
    );
  });

  it("passes custom page and limit when valid", async () => {
    await GET(makeGetRequest(BASE_PATH, { page: "2", limit: "10" }), makeContext());

    expect(listLeadActivities).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      { page: 2, limit: 10 }
    );
  });

  it("returns 422 for a non-integer page", async () => {
    const res = await GET(makeGetRequest(BASE_PATH, { page: "abc" }), makeContext());

    expect(res.status).toBe(422);
  });

  it("returns 422 for limit exceeding 100", async () => {
    const res = await GET(makeGetRequest(BASE_PATH, { limit: "101" }), makeContext());

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// GET — successful response
// ---------------------------------------------------------------------------

describe("GET /activities — successful response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with empty array and meta when no activities exist", async () => {
    vi.mocked(listLeadActivities).mockResolvedValue([]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json() as { data: unknown[]; meta: { count: number } };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
  });

  it("returns activities in the data field", async () => {
    const activities = [makeActivity(), makeActivity({ id: "activ222-0000-0000-0000-000000000002", type: "call" })];
    vi.mocked(listLeadActivities).mockResolvedValue(activities);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json() as { data: LeadActivity[] };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]?.type).toBe("note");
    expect(body.data[1]?.type).toBe("call");
  });

  it("passes the verified organizationId and userId to the domain function", async () => {
    vi.mocked(listLeadActivities).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(listLeadActivities).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      expect.any(Object)
    );
  });

  it("returns 404 when the lead does not belong to the organization", async () => {
    vi.mocked(listLeadActivities).mockRejectedValue(new NotFoundError("Lead"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET — security: cross-tenant isolation
// ---------------------------------------------------------------------------

describe("GET /activities — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 404 when attempting to access a lead from another organization", async () => {
    // Domain layer throws NotFoundError when the lead doesn't belong to org A
    vi.mocked(listLeadActivities).mockRejectedValue(new NotFoundError("Lead"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(404);
    // Must NOT be 200 (would leak cross-tenant data)
    expect(res.status).not.toBe(200);
  });

  it("uses the URL organizationId, not any client-supplied value", async () => {
    vi.mocked(listLeadActivities).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH), makeContext());

    const [calledOrgId] = vi.mocked(listLeadActivities).mock.calls[0] as [string, ...unknown[]];
    expect(calledOrgId).toBe(ORG_A);
    // Ensure ORG_B is never passed as the organization
    expect(calledOrgId).not.toBe(ORG_B);
  });
});

// ---------------------------------------------------------------------------
// POST — authentication
// ---------------------------------------------------------------------------

describe("POST /activities — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const res = await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test" }),
      makeContext()
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const res = await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test" }),
      makeContext()
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST — leadId validation
// ---------------------------------------------------------------------------

describe("POST /activities — leadId validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for an invalid (non-UUID) leadId", async () => {
    const res = await POST(
      makePostRequest(
        `/api/v1/organizations/${ORG_A}/leads/${INVALID_LEAD_ID}/activities`,
        { type: "note", content: "Test" }
      ),
      makeContext(INVALID_LEAD_ID)
    );

    expect(res.status).toBe(422);
    expect(createLeadActivity).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST — body validation
// ---------------------------------------------------------------------------

describe("POST /activities — body validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for an invalid activity type", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { type: "invalid_type", content: "Test" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(createLeadActivity).not.toHaveBeenCalled();
  });

  it("returns 422 for internally recorded types so clients cannot spoof them", async () => {
    for (const type of ["conversation", "follow_up", "appointment"] as const) {
      const res = await POST(
        makePostRequest(BASE_PATH, { type, content: "Spoofed event" }),
        makeContext()
      );
      expect(res.status).toBe(422);
    }
    expect(createLeadActivity).not.toHaveBeenCalled();
  });

  it("returns 422 when content is missing", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { type: "note" }),
      makeContext()
    );

    expect(res.status).toBe(422);
  });

  it("returns 422 when content is empty string", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "" }),
      makeContext()
    );

    expect(res.status).toBe(422);
  });

  it("returns 422 when body is not valid JSON", async () => {
    const req = new NextRequest(`http://localhost${BASE_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });

    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST — client cannot supply server-side fields
// ---------------------------------------------------------------------------

describe("POST /activities — server-side fields cannot be supplied by client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createLeadActivity).mockResolvedValue(makeActivity());
  });

  it("ignores organization_id in the request body", async () => {
    await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test", organization_id: ORG_B }),
      makeContext()
    );

    // Domain function receives ORG_A from the URL, not ORG_B from the body
    const [calledOrgId] = vi.mocked(createLeadActivity).mock.calls[0] as [string, ...unknown[]];
    expect(calledOrgId).toBe(ORG_A);
  });

  it("ignores user_id in the request body", async () => {
    await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test", user_id: "malicious-id" }),
      makeContext()
    );

    // Domain function receives USER_1 from the auth context
    const [, calledUserId] = vi.mocked(createLeadActivity).mock.calls[0] as [string, string, ...unknown[]];
    expect(calledUserId).toBe(USER_1);
  });

  it("ignores lead_id in the request body", async () => {
    await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test", lead_id: "malicious-lead" }),
      makeContext()
    );

    // Domain function receives LEAD_ID from the URL path
    const [,, calledLeadId] = vi.mocked(createLeadActivity).mock.calls[0] as [string, string, string, ...unknown[]];
    expect(calledLeadId).toBe(LEAD_ID);
  });
});

// ---------------------------------------------------------------------------
// POST — successful creation
// ---------------------------------------------------------------------------

describe("POST /activities — successful creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 201 with the created activity", async () => {
    const activity = makeActivity({ type: "call", content: "Spoke for 10 minutes" });
    vi.mocked(createLeadActivity).mockResolvedValue(activity);

    const res = await POST(
      makePostRequest(BASE_PATH, { type: "call", content: "Spoke for 10 minutes" }),
      makeContext()
    );
    const body = await res.json() as { data: LeadActivity };

    expect(res.status).toBe(201);
    expect(body.data.type).toBe("call");
    expect(body.data.content).toBe("Spoke for 10 minutes");
  });

  it("passes the verified organizationId, userId, and leadId to the domain function", async () => {
    vi.mocked(createLeadActivity).mockResolvedValue(makeActivity());

    await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Follow-up required" }),
      makeContext()
    );

    expect(createLeadActivity).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      expect.objectContaining({ type: "note", content: "Follow-up required" })
    );
  });

  it("returns 404 when the lead does not belong to this organization", async () => {
    vi.mocked(createLeadActivity).mockRejectedValue(new NotFoundError("Lead"));

    const res = await POST(
      makePostRequest(BASE_PATH, { type: "note", content: "Test" }),
      makeContext()
    );

    expect(res.status).toBe(404);
  });
});
