/**
 * Tests for GET /api/v1/organizations/:organizationId/appointments
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { AppointmentWithLead, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/appointments/queries", () => ({
  listAppointments: vi.fn(),
  listLeadAppointments: vi.fn(),
  getAppointment: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listAppointments } from "@/modules/appointments/queries";
import { GET, APPOINTMENT_QUEUE_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/appointments`;

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

function makeAppointment(
  overrides: Partial<AppointmentWithLead> = {}
): AppointmentWithLead {
  return {
    id: "aaaaaaaa-0000-4000-8000-0000000000aa",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    starts_at: "2026-08-22T10:00:00Z",
    ends_at: null,
    status: "scheduled",
    location: null,
    notes: null,
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

function makeGetRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: "GET" });
}

function makeContext() {
  return { params: Promise.resolve({ organizationId: ORG_A }) };
}

describe("GET /appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listAppointments).mockResolvedValue([]);
  });

  it("returns 401 / 403", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(401);
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(403);
  });

  it("uses default pagination", async () => {
    await GET(makeGetRequest(BASE_PATH), makeContext());
    expect(listAppointments).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      {
        page: APPOINTMENT_QUEUE_PAGINATION_DEFAULTS.page,
        limit: APPOINTMENT_QUEUE_PAGINATION_DEFAULTS.limit,
      },
      {}
    );
  });

  it("passes filters including from/to and unassigned", async () => {
    await GET(
      makeGetRequest(BASE_PATH, {
        status: "scheduled",
        assigned_user_id: "unassigned",
        lead_id: LEAD_ID,
        from: "2026-08-20T00:00:00Z",
        to: "2026-08-30T00:00:00Z",
      }),
      makeContext()
    );
    expect(listAppointments).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      expect.objectContaining({
        status: "scheduled",
        assignedUserId: "unassigned",
        leadId: LEAD_ID,
        from: expect.any(String),
        to: expect.any(String),
      })
    );
  });

  it("returns 422 for invalid status, assignee, and datetime bounds", async () => {
    expect(
      (await GET(makeGetRequest(BASE_PATH, { status: "overdue" }), makeContext()))
        .status
    ).toBe(422);
    expect(
      (await GET(makeGetRequest(BASE_PATH, { assigned_user_id: "nope" }), makeContext()))
        .status
    ).toBe(422);
    expect(
      (await GET(makeGetRequest(BASE_PATH, { from: "not-a-date" }), makeContext()))
        .status
    ).toBe(422);
    expect(listAppointments).not.toHaveBeenCalled();
  });

  it("returns 200 with the queue", async () => {
    vi.mocked(listAppointments).mockResolvedValue([makeAppointment()]);
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = (await res.json()) as { data: AppointmentWithLead[] };
    expect(res.status).toBe(200);
    expect(body.data[0]?.lead?.first_name).toBe("Ahmed");
  });
});
