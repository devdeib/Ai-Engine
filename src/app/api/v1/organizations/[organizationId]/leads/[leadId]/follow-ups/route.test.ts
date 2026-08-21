/**
 * Tests for:
 *   GET  /api/v1/organizations/:organizationId/leads/:leadId/follow-ups
 *   POST /api/v1/organizations/:organizationId/leads/:leadId/follow-ups
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { LeadFollowUp, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/follow-ups/queries", () => ({
  listLeadFollowUps: vi.fn(),
  getLeadFollowUp: vi.fn(),
  listFollowUps: vi.fn(),
}));

vi.mock("@/modules/follow-ups/actions", () => ({
  createLeadFollowUp: vi.fn(),
  updateLeadFollowUp: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listLeadFollowUps } from "@/modules/follow-ups/queries";
import { createLeadFollowUp } from "@/modules/follow-ups/actions";
import { GET, POST, FOLLOW_UP_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const INVALID_ID = "not-a-uuid";
const DUE_AT = "2026-08-22T10:00:00Z";

const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads/${LEAD_ID}/follow-ups`;

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

function makeFollowUp(overrides: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id: "ffffffff-0000-4000-8000-000000000001",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: "Discuss the two-bedroom option",
    due_at: DUE_AT,
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
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

describe("GET /leads/:leadId/follow-ups — authentication", () => {
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

describe("GET /leads/:leadId/follow-ups — validation and success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listLeadFollowUps).mockResolvedValue([]);
  });

  it("returns 422 for a malformed lead UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/leads/${INVALID_ID}/follow-ups`),
      makeContext(INVALID_ID)
    );
    expect(res.status).toBe(422);
    expect(listLeadFollowUps).not.toHaveBeenCalled();
  });

  it("uses default pagination", async () => {
    await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(listLeadFollowUps).toHaveBeenCalledWith(ORG_A, USER_1, LEAD_ID, {
      page: FOLLOW_UP_PAGINATION_DEFAULTS.page,
      limit: FOLLOW_UP_PAGINATION_DEFAULTS.limit,
    });
  });

  it("returns 422 for limit exceeding 100", async () => {
    const res = await GET(makeGetRequest(BASE_PATH, { limit: "101" }), makeContext());
    expect(res.status).toBe(422);
  });

  it("returns 200 with follow-ups", async () => {
    vi.mocked(listLeadFollowUps).mockResolvedValue([makeFollowUp()]);
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = (await res.json()) as { data: LeadFollowUp[] };
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.title).toBe("Call Ahmed about the property");
  });

  it("returns 404 when the lead does not belong to the organization", async () => {
    vi.mocked(listLeadFollowUps).mockRejectedValue(new NotFoundError("Lead"));
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(res.status).toBe(404);
  });

  it("uses the URL organizationId, not a client-supplied value", async () => {
    await GET(makeGetRequest(BASE_PATH), makeContext());
    const [calledOrgId] = vi.mocked(listLeadFollowUps).mock.calls[0] as [
      string,
      ...unknown[],
    ];
    expect(calledOrgId).toBe(ORG_A);
    expect(calledOrgId).not.toBe(ORG_B);
  });
});

describe("POST /leads/:leadId/follow-ups — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "Call", due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "Call", due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /leads/:leadId/follow-ups — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 422 for a malformed lead UUID", async () => {
    const res = await POST(
      makePostRequest(
        `/api/v1/organizations/${ORG_A}/leads/${INVALID_ID}/follow-ups`,
        { title: "Call", due_at: DUE_AT }
      ),
      makeContext(INVALID_ID)
    );
    expect(res.status).toBe(422);
    expect(createLeadFollowUp).not.toHaveBeenCalled();
  });

  it("returns 422 when title is missing", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when title is blank", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "  ", due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for an invalid timestamp", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "Call", due_at: "not-a-date" }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for an oversized title", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "x".repeat(201), due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for oversized notes", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, {
        title: "Call",
        due_at: DUE_AT,
        notes: "x".repeat(2001),
      }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for an invalid assigned_user_id", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, {
        title: "Call",
        due_at: DUE_AT,
        assigned_user_id: "nope",
      }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /leads/:leadId/follow-ups — identity stripping and success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createLeadFollowUp).mockResolvedValue(makeFollowUp());
  });

  it("ignores forged organization_id, lead_id, and user_id in the body", async () => {
    await POST(
      makePostRequest(BASE_PATH, {
        title: "Call Ahmed",
        due_at: DUE_AT,
        organization_id: ORG_B,
        lead_id: "22222222-2222-4222-8222-222222222222",
        user_id: "malicious-id",
      }),
      makeContext()
    );

    expect(createLeadFollowUp).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      expect.objectContaining({ title: "Call Ahmed" })
    );
    const input = vi.mocked(createLeadFollowUp).mock.calls[0]?.[3] as Record<
      string,
      unknown
    >;
    expect(input).not.toHaveProperty("organization_id");
    expect(input).not.toHaveProperty("lead_id");
    expect(input).not.toHaveProperty("user_id");
  });

  it("returns 201 with the created follow-up", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, {
        title: "Call Ahmed about the property",
        due_at: DUE_AT,
      }),
      makeContext()
    );
    const body = (await res.json()) as { data: LeadFollowUp };
    expect(res.status).toBe(201);
    expect(body.data.title).toBe("Call Ahmed about the property");
  });

  it("returns 404 for a cross-tenant lead", async () => {
    vi.mocked(createLeadFollowUp).mockRejectedValue(new NotFoundError("Lead"));
    const res = await POST(
      makePostRequest(BASE_PATH, { title: "Call", due_at: DUE_AT }),
      makeContext()
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for a cross-tenant assigned_user_id", async () => {
    vi.mocked(createLeadFollowUp).mockRejectedValue(
      new ValidationError("Invalid follow-up data", {
        assigned_user_id: ["Assignee must be a member of this organization"],
      })
    );
    const res = await POST(
      makePostRequest(BASE_PATH, {
        title: "Call",
        due_at: DUE_AT,
        assigned_user_id: "bbbbbbbb-0000-4000-8000-0000000000bb",
      }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });
});
