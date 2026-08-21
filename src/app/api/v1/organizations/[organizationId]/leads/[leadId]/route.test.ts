/**
 * Tests for:
 *   GET    /api/v1/organizations/:organizationId/leads/:leadId
 *   PATCH  /api/v1/organizations/:organizationId/leads/:leadId
 *   DELETE /api/v1/organizations/:organizationId/leads/:leadId
 *
 * Strategy: mock the auth layer and domain functions; test the HTTP boundary
 * (UUID validation, response shape, status codes, error mapping).
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, NotFoundError, TenantAccessError } from "@/lib/errors";
import type { Lead, OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

// ---------------------------------------------------------------------------
// Module mocks
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
import { getLead } from "@/modules/leads/queries";
import { updateLead, deleteLead } from "@/modules/leads/actions";
import { GET, PATCH, DELETE } from "./route";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-0000-0000-000000000001";
// Zod v4 uuid() requires version bits [1-8] in group 3 and variant bits [89abAB] in group 4.
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INVALID_UUID = "not-a-uuid";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads/${LEAD_1}`;

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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request / context helpers
// ---------------------------------------------------------------------------

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

function makeDeleteRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "DELETE",
  });
}

function makeContext(organizationId: string = ORG_A, leadId: string = LEAD_1) {
  return { params: Promise.resolve({ organizationId, leadId }) };
}

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/:organizationId/leads/:leadId
// ---------------------------------------------------------------------------

describe("GET /organizations/:organizationId/leads/:leadId — authentication", () => {
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

describe("GET /organizations/:organizationId/leads/:leadId — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the leadId is not a valid UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/leads/${INVALID_UUID}`),
      makeContext(ORG_A, INVALID_UUID)
    );

    expect(res.status).toBe(422);
    expect(getLead).not.toHaveBeenCalled();
  });
});

describe("GET /organizations/:organizationId/leads/:leadId — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the lead when it exists in the org", async () => {
    vi.mocked(getLead).mockResolvedValue(makeLeadRow());

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(LEAD_1);
    expect(body.data.organization_id).toBe(ORG_A);
  });

  it("returns 404 when the lead does not exist", async () => {
    vi.mocked(getLead).mockRejectedValue(new NotFoundError("Lead"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a cross-tenant lead (same status as not-found — no info leakage)", async () => {
    // getLead throws NotFoundError for cross-tenant leads — indistinguishable
    // from "does not exist", preventing information leakage.
    vi.mocked(getLead).mockRejectedValue(new NotFoundError("Lead"));

    const res = await GET(makeGetRequest(BASE_PATH), makeContext(ORG_B, LEAD_1));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/organizations/:organizationId/leads/:leadId
// ---------------------------------------------------------------------------

describe("PATCH /organizations/:organizationId/leads/:leadId — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const req = makePatchRequest(BASE_PATH, { first_name: "Samir" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(401);
  });
});

describe("PATCH /organizations/:organizationId/leads/:leadId — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the leadId is not a valid UUID", async () => {
    const req = makePatchRequest(
      `/api/v1/organizations/${ORG_A}/leads/${INVALID_UUID}`,
      { first_name: "Samir" }
    );
    const res = await PATCH(req, makeContext(ORG_A, INVALID_UUID));

    expect(res.status).toBe(422);
    expect(updateLead).not.toHaveBeenCalled();
  });
});

describe("PATCH /organizations/:organizationId/leads/:leadId — successful update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 200 with the updated lead", async () => {
    const updatedLead = makeLeadRow({ first_name: "Samir" });
    vi.mocked(updateLead).mockResolvedValue(updatedLead);

    const req = makePatchRequest(BASE_PATH, { first_name: "Samir" });
    const res = await PATCH(req, makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.first_name).toBe("Samir");
  });

  it("accepts a null email update (channel-agnostic)", async () => {
    const updatedLead = makeLeadRow({ email: null });
    vi.mocked(updateLead).mockResolvedValue(updatedLead);

    const req = makePatchRequest(BASE_PATH, { email: null });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(200);
  });

  it("cannot change organization_id — the field is stripped before reaching updateLead", async () => {
    const lead = makeLeadRow();
    vi.mocked(updateLead).mockResolvedValue(lead);

    const req = makePatchRequest(BASE_PATH, {
      first_name: "Samir",
      organization_id: ORG_B, // attacker-supplied
    });
    await PATCH(req, makeContext());

    // updateLead must receive data that does not contain organization_id
    expect(updateLead).toHaveBeenCalledWith(
      LEAD_1,
      ORG_A,
      USER_1,
      expect.not.objectContaining({ organization_id: expect.anything() })
    );
  });
});

describe("PATCH /organizations/:organizationId/leads/:leadId — validation and errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the body contains an invalid field value", async () => {
    const req = makePatchRequest(BASE_PATH, { score: 999 }); // score max is 100
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(422);
    expect(updateLead).not.toHaveBeenCalled();
  });

  it("returns 404 when the lead does not exist", async () => {
    vi.mocked(updateLead).mockRejectedValue(new NotFoundError("Lead"));

    const req = makePatchRequest(BASE_PATH, { first_name: "Samir" });
    const res = await PATCH(req, makeContext());

    expect(res.status).toBe(404);
  });

  it("returns 404 for a cross-tenant lead (no info leakage)", async () => {
    vi.mocked(updateLead).mockRejectedValue(new NotFoundError("Lead"));

    const req = makePatchRequest(BASE_PATH, { first_name: "Samir" });
    const res = await PATCH(req, makeContext(ORG_B, LEAD_1));

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/organizations/:organizationId/leads/:leadId
// ---------------------------------------------------------------------------

describe("DELETE /organizations/:organizationId/leads/:leadId — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());

    const res = await DELETE(makeDeleteRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(401);
  });
});

describe("DELETE /organizations/:organizationId/leads/:leadId — UUID validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 when the leadId is not a valid UUID", async () => {
    const res = await DELETE(
      makeDeleteRequest(`/api/v1/organizations/${ORG_A}/leads/${INVALID_UUID}`),
      makeContext(ORG_A, INVALID_UUID)
    );

    expect(res.status).toBe(422);
    expect(deleteLead).not.toHaveBeenCalled();
  });
});

describe("DELETE /organizations/:organizationId/leads/:leadId — authorized deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 204 with no body when deletion succeeds", async () => {
    vi.mocked(deleteLead).mockResolvedValue(undefined);

    const res = await DELETE(makeDeleteRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
  });

  it("calls deleteLead with the correct lead, org, and user", async () => {
    vi.mocked(deleteLead).mockResolvedValue(undefined);

    await DELETE(makeDeleteRequest(BASE_PATH), makeContext());

    expect(deleteLead).toHaveBeenCalledWith(LEAD_1, ORG_A, USER_1);
  });
});

describe("DELETE /organizations/:organizationId/leads/:leadId — authorization and error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 404 when a non-owner/admin attempts deletion (RLS blocks via NotFoundError)", async () => {
    // The DB-layer DELETE policy restricts to owner/admin.
    // deleteLead detects 0 rows deleted and throws NotFoundError.
    // The API returns 404, which does not reveal whether the lead was
    // inaccessible due to role or does not exist.
    vi.mocked(deleteLead).mockRejectedValue(new NotFoundError("Lead"));

    const res = await DELETE(makeDeleteRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(404);
  });

  it("returns 404 when the lead does not exist", async () => {
    vi.mocked(deleteLead).mockRejectedValue(new NotFoundError("Lead"));

    const res = await DELETE(makeDeleteRequest(BASE_PATH), makeContext());

    expect(res.status).toBe(404);
  });

  it("returns 404 for a cross-tenant lead (does not leak tenant information)", async () => {
    vi.mocked(deleteLead).mockRejectedValue(new NotFoundError("Lead"));

    const res = await DELETE(makeDeleteRequest(BASE_PATH), makeContext(ORG_B, LEAD_1));

    expect(res.status).toBe(404);
  });
});
