/**
 * Tests for GET /api/v1/organizations/:organizationId/follow-ups
 *
 * NO LIVE DATABASE OR SUPABASE REQUIRED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  TenantAccessError,
} from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { LeadFollowUpWithLead, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/follow-ups/queries", () => ({
  listFollowUps: vi.fn(),
  listLeadFollowUps: vi.fn(),
  getLeadFollowUp: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listFollowUps } from "@/modules/follow-ups/queries";
import { GET, FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/follow-ups`;

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

function makeFollowUp(
  overrides: Partial<LeadFollowUpWithLead> = {}
): LeadFollowUpWithLead {
  return {
    id: "ffffffff-0000-4000-8000-000000000001",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: null,
    due_at: "2026-08-22T10:00:00Z",
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    lead: {
      id: LEAD_ID,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function makeGetRequest(
  path: string,
  params: Record<string, string> = {}
): NextRequest {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: "GET" });
}

function makeContext() {
  return { params: Promise.resolve({ organizationId: ORG_A }) };
}

describe("GET /follow-ups — authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(res.status).toBe(403);
  });
});

describe("GET /follow-ups — filters and success", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listFollowUps).mockResolvedValue([]);
  });

  it("uses default pagination", async () => {
    await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(listFollowUps).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      {
        page: FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS.page,
        limit: FOLLOW_UP_QUEUE_PAGINATION_DEFAULTS.limit,
      },
      {}
    );
  });

  it("passes status, assigned_user_id, lead_id, and overdue filters", async () => {
    await GET(
      makeGetRequest(BASE_PATH, {
        status: "pending",
        assigned_user_id: USER_1,
        lead_id: LEAD_ID,
        overdue: "true",
      }),
      makeContext()
    );

    expect(listFollowUps).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      {
        status: "pending",
        assignedUserId: USER_1,
        leadId: LEAD_ID,
        overdue: true,
      }
    );
  });

  it("accepts assigned_user_id=unassigned", async () => {
    await GET(
      makeGetRequest(BASE_PATH, { assigned_user_id: "unassigned" }),
      makeContext()
    );
    expect(listFollowUps).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      expect.any(Object),
      expect.objectContaining({ assignedUserId: "unassigned" })
    );
  });

  it("returns 422 for an invalid status", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { status: "overdue" }),
      makeContext()
    );
    expect(res.status).toBe(422);
    expect(listFollowUps).not.toHaveBeenCalled();
  });

  it("returns 422 for a malformed assigned_user_id", async () => {
    const res = await GET(
      makeGetRequest(BASE_PATH, { assigned_user_id: "nope" }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 200 with the queue", async () => {
    vi.mocked(listFollowUps).mockResolvedValue([makeFollowUp()]);
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = (await res.json()) as { data: LeadFollowUpWithLead[] };
    expect(res.status).toBe(200);
    expect(body.data[0]?.lead?.first_name).toBe("Ahmed");
  });
});
