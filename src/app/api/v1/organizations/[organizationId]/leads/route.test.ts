/**
 * Tests for:
 *   GET  /api/v1/organizations/:organizationId/leads
 *   POST /api/v1/organizations/:organizationId/leads
 *
 * Strategy: mock the auth layer and domain functions; test the HTTP boundary
 * (request parsing, validation, response shape, status codes).
 * Domain logic is already covered by queries.test.ts and actions.test.ts.
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { Lead, OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before the imports they affect.
// ---------------------------------------------------------------------------

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/leads/queries", () => ({
  listLeads: vi.fn(),
  getLead: vi.fn(),
}));

vi.mock("@/modules/leads/actions", () => ({
  createLead: vi.fn(),
  updateLead: vi.fn(),
  deleteLead: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listLeads } from "@/modules/leads/queries";
import { createLead } from "@/modules/leads/actions";
import { GET, POST } from "./route";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads`;

const mockUser = { id: USER_1, email: "user@example.com" } as unknown as User;

const mockMember: OrganizationMember = {
  id: "ffffffff-0000-0000-0000-000000000001",
  organization_id: ORG_A,
  user_id: USER_1,
  role: "owner",
  invited_by: null,
  created_at: "2026-08-19T00:00:00Z",
  updated_at: "2026-08-19T00:00:00Z",
};

const mockOrgContext = { user: mockUser, member: mockMember, organizationId: ORG_A };

function makeLeadRow(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: "+974 55 123 456",
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request / context helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/:organizationId/leads
// ---------------------------------------------------------------------------

describe("GET /organizations/:organizationId/leads — authentication", () => {
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
    vi.mocked(listLeads).mockResolvedValue([]);

    const req = makeGetRequest(BASE_PATH);
    await GET(req, makeContext(ORG_A));

    expect(getOrgContext).toHaveBeenCalledWith(req, ORG_A);
  });
});

describe("GET /organizations/:organizationId/leads — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the lead collection and pagination metadata", async () => {
    const leads = [makeLeadRow(), makeLeadRow({ id: "lead-2", first_name: "Sara" })];
    vi.mocked(listLeads).mockResolvedValue(leads);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({ page: 1, limit: 20, count: 2 });
  });

  it("returns empty array and zero count when the org has no leads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
  });

  it("applies default pagination (page=1, limit=20) when no params are provided", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH), makeContext());

    expect(listLeads).toHaveBeenCalledWith(ORG_A, USER_1, { page: 1, limit: 20 }, {});
  });

  it("passes explicit page and limit to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(
      makeGetRequest(BASE_PATH, { page: "2", limit: "10" }),
      makeContext()
    );

    expect(listLeads).toHaveBeenCalledWith(ORG_A, USER_1, { page: 2, limit: 10 }, {});
  });

  it("reflects pagination params in the meta response", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    const res = await GET(
      makeGetRequest(BASE_PATH, { page: "3", limit: "5" }),
      makeContext()
    );
    const body = await res.json();

    expect(body.meta).toMatchObject({ page: 3, limit: 5 });
  });
});

describe("GET /organizations/:organizationId/leads — pagination validation", () => {
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
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("rejects page < 1 with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { page: "0" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric limit with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { limit: "abc" }),
      makeContext()
    );

    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/:organizationId/leads
// ---------------------------------------------------------------------------

describe("POST /organizations/:organizationId/leads — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when the request is unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const req = makePostRequest(BASE_PATH, { first_name: "Ahmed", last_name: "Ali" });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(401);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member of the organization", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());

    const req = makePostRequest(BASE_PATH, { first_name: "Ahmed", last_name: "Ali" });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(403);
    expect(createLead).not.toHaveBeenCalled();
  });
});

describe("POST /organizations/:organizationId/leads — successful creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 201 with the created lead on success", async () => {
    const lead = makeLeadRow();
    vi.mocked(createLead).mockResolvedValue(lead);

    const req = makePostRequest(BASE_PATH, {
      first_name: "Ahmed",
      last_name: "Ali",
      phone: "+974 55 123 456",
    });
    const res = await POST(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe(LEAD_1);
  });

  it("accepts a lead with null email (channel-agnostic)", async () => {
    const lead = makeLeadRow({ email: null });
    vi.mocked(createLead).mockResolvedValue(lead);

    const req = makePostRequest(BASE_PATH, {
      first_name: "Ahmed",
      last_name: "Ali",
      email: null,
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(201);
  });

  it("passes the verified organizationId to createLead, not any client-supplied value", async () => {
    const lead = makeLeadRow();
    vi.mocked(createLead).mockResolvedValue(lead);

    const req = makePostRequest(BASE_PATH, {
      first_name: "Ahmed",
      last_name: "Ali",
      organization_id: ORG_B, // attacker-supplied — must be ignored
    });
    await POST(req, makeContext());

    // createLead must be called with ORG_A (the verified context), not ORG_B
    expect(createLead).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.not.objectContaining({ organization_id: expect.anything() })
    );
  });
});

describe("POST /organizations/:organizationId/leads — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when required fields are missing", async () => {
    const req = makePostRequest(BASE_PATH, { phone: "+974 55 123 456" }); // missing name
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
    expect(createLead).not.toHaveBeenCalled();
  });

  it("returns 422 when the email format is invalid", async () => {
    const req = makePostRequest(BASE_PATH, {
      first_name: "Ahmed",
      last_name: "Ali",
      email: "not-an-email",
    });
    const res = await POST(req, makeContext());

    expect(res.status).toBe(422);
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
});

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/:organizationId/leads — search, filter, sort
// ---------------------------------------------------------------------------

describe("GET /organizations/:organizationId/leads — search parameter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("passes the search term to listLeads when ?search= is provided", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { search: "ahmed" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      expect.objectContaining({ search: "ahmed" })
    );
  });

  it("omits search from filter when ?search= is empty string", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { search: "" }), makeContext());

    const filterArg = vi.mocked(listLeads).mock.calls[0]?.[3];
    expect(filterArg).not.toHaveProperty("search");
  });

  it("trims the search parameter before passing to domain", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { search: "  ahmed  " }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ search: "ahmed" })
    );
  });

  it("rejects search longer than 200 characters with 422", async () => {
    const longSearch = "a".repeat(201);
    const res = await GET(makeGetRequest(BASE_PATH, { search: longSearch }), makeContext());

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });
});

describe("GET /organizations/:organizationId/leads — status filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("passes a single status value to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { status: "qualified" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ status: ["qualified"] })
    );
  });

  it("passes multiple comma-separated status values to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { status: "new,qualified" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ status: ["new", "qualified"] })
    );
  });

  it("silently drops unrecognised status values", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { status: "new,invalid_status" }), makeContext());

    const filterArg = vi.mocked(listLeads).mock.calls[0]?.[3];
    expect(filterArg?.status).toEqual(["new"]);
  });

  it("omits status filter when all values are unrecognised", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { status: "bogus" }), makeContext());

    const filterArg = vi.mocked(listLeads).mock.calls[0]?.[3];
    expect(filterArg).not.toHaveProperty("status");
  });
});

describe("GET /organizations/:organizationId/leads — source filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("passes a single source value to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { source: "website" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ source: ["website"] })
    );
  });

  it("passes multiple comma-separated source values to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { source: "website,referral" }), makeContext());

    const filterArg = vi.mocked(listLeads).mock.calls[0]?.[3];
    expect(filterArg?.source).toEqual(["website", "referral"]);
  });
});

describe("GET /organizations/:organizationId/leads — sort parameters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("passes sortBy to listLeads when provided", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { sortBy: "first_name" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ sortBy: "first_name" })
    );
  });

  it("passes sortOrder to listLeads when provided", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { sortOrder: "asc" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ sortOrder: "asc" })
    );
  });

  it("rejects an unrecognised sortBy value with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { sortBy: "invalid_field" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised sortOrder value with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { sortOrder: "random" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("passes combined search, filter, and sort to listLeads", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(
      makeGetRequest(BASE_PATH, {
        search: "ahmed",
        status: "new",
        sortBy: "score",
        sortOrder: "desc",
        page: "2",
        limit: "10",
      }),
      makeContext()
    );

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 2, limit: 10 },
      expect.objectContaining({
        search: "ahmed",
        status: ["new"],
        sortBy: "score",
        sortOrder: "desc",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// GET /leads — owner_id filter (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_UUID = "eeeeeeee-0000-4000-8000-000000000099";

describe("GET /organizations/:organizationId/leads — owner_id filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("passes ownerId='unassigned' to listLeads when owner_id=unassigned", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { owner_id: "unassigned" }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ ownerId: "unassigned" })
    );
  });

  it("passes ownerId UUID to listLeads when owner_id is a valid UUID", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, { owner_id: OWNER_UUID }), makeContext());

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ ownerId: OWNER_UUID })
    );
  });

  it("rejects an invalid (non-UUID, non-'unassigned') owner_id with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { owner_id: "not-a-uuid-or-keyword" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it("does not include ownerId in filter when owner_id param is absent", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, {}), makeContext());

    const filter = vi.mocked(listLeads).mock.calls[0]?.[3] as Record<string, unknown>;
    expect(filter).not.toHaveProperty("ownerId");
  });

  it("passes owner_id alongside search, status, and sort", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(
      makeGetRequest(BASE_PATH, {
        owner_id: OWNER_UUID,
        search: "ahmed",
        status: "new",
        sortBy: "score",
        sortOrder: "desc",
      }),
      makeContext()
    );

    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({
        ownerId: OWNER_UUID,
        search: "ahmed",
        status: ["new"],
        sortBy: "score",
        sortOrder: "desc",
      })
    );
  });
});

describe("GET /organizations/:organizationId/leads — exclude_channel_stubs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("forwards excludeChannelStubs=true when exclude_channel_stubs=true", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    const res = await GET(
      makeGetRequest(BASE_PATH, { exclude_channel_stubs: "true" }),
      makeContext()
    );

    expect(res.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ excludeChannelStubs: true })
    );
  });

  it("does not set excludeChannelStubs when omitted or false", async () => {
    vi.mocked(listLeads).mockResolvedValue([]);

    await GET(makeGetRequest(BASE_PATH, {}), makeContext());
    expect(vi.mocked(listLeads).mock.calls[0]?.[3]).not.toHaveProperty(
      "excludeChannelStubs"
    );

    vi.mocked(listLeads).mockClear();
    await GET(
      makeGetRequest(BASE_PATH, { exclude_channel_stubs: "false" }),
      makeContext()
    );
    expect(vi.mocked(listLeads).mock.calls[0]?.[3]).not.toHaveProperty(
      "excludeChannelStubs"
    );
  });

  it("rejects an invalid boolean with 422", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { exclude_channel_stubs: "yes" }),
      makeContext()
    );

    expect(res.status).toBe(422);
    expect(listLeads).not.toHaveBeenCalled();
  });
});
