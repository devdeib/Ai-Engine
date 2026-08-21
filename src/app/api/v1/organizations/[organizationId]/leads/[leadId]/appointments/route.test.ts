/**
 * Tests for lead-scoped appointment GET/POST.
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
import type { Appointment, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/appointments/queries", () => ({
  listLeadAppointments: vi.fn(),
  getAppointment: vi.fn(),
  listAppointments: vi.fn(),
}));

vi.mock("@/modules/appointments/actions", () => ({
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listLeadAppointments } from "@/modules/appointments/queries";
import { createAppointment } from "@/modules/appointments/actions";
import { GET, POST, APPOINTMENT_PAGINATION_DEFAULTS } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const INVALID_ID = "not-a-uuid";
const STARTS_AT = "2026-08-22T10:00:00Z";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/leads/${LEAD_ID}/appointments`;

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

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "aaaaaaaa-0000-4000-8000-0000000000aa",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    starts_at: STARTS_AT,
    ends_at: null,
    status: "scheduled",
    location: null,
    notes: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function makeGetRequest(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url.toString(), { method: "GET" });
}

function makePostRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(leadId = LEAD_ID) {
  return { params: Promise.resolve({ organizationId: ORG_A, leadId }) };
}

describe("GET /leads/:leadId/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listLeadAppointments).mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(403);
  });

  it("returns 422 for a malformed lead UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/leads/${INVALID_ID}/appointments`),
      makeContext(INVALID_ID)
    );
    expect(res.status).toBe(422);
    expect(listLeadAppointments).not.toHaveBeenCalled();
  });

  it("uses default pagination and returns 200", async () => {
    vi.mocked(listLeadAppointments).mockResolvedValue([makeAppointment()]);
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = (await res.json()) as { data: Appointment[] };
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(listLeadAppointments).toHaveBeenCalledWith(ORG_A, USER_1, LEAD_ID, {
      page: APPOINTMENT_PAGINATION_DEFAULTS.page,
      limit: APPOINTMENT_PAGINATION_DEFAULTS.limit,
    });
  });

  it("returns 404 for a cross-tenant lead", async () => {
    vi.mocked(listLeadAppointments).mockRejectedValue(new NotFoundError("Lead"));
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(404);
  });
});

describe("POST /leads/:leadId/appointments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createAppointment).mockResolvedValue(makeAppointment());
  });

  it("returns 401 / 403", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect(
      (await POST(makePostRequest(BASE_PATH, { starts_at: STARTS_AT }), makeContext())).status
    ).toBe(401);
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect(
      (await POST(makePostRequest(BASE_PATH, { starts_at: STARTS_AT }), makeContext())).status
    ).toBe(403);
  });

  it("returns 422 for malformed UUID, datetime, and ends_at <= starts_at", async () => {
    expect(
      (
        await POST(
          makePostRequest(
            `/api/v1/organizations/${ORG_A}/leads/${INVALID_ID}/appointments`,
            { starts_at: STARTS_AT }
          ),
          makeContext(INVALID_ID)
        )
      ).status
    ).toBe(422);
    expect(
      (await POST(makePostRequest(BASE_PATH, { starts_at: "nope" }), makeContext())).status
    ).toBe(422);
    expect(
      (
        await POST(
          makePostRequest(BASE_PATH, { starts_at: STARTS_AT, ends_at: STARTS_AT }),
          makeContext()
        )
      ).status
    ).toBe(422);
  });

  it("strips forged identity fields and returns 201", async () => {
    const res = await POST(
      makePostRequest(BASE_PATH, {
        starts_at: STARTS_AT,
        organization_id: ORG_B,
        lead_id: "22222222-2222-4222-8222-222222222222",
        user_id: "malicious",
      }),
      makeContext()
    );
    expect(res.status).toBe(201);
    expect(createAppointment).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      LEAD_ID,
      expect.objectContaining({ starts_at: expect.any(String) })
    );
    const input = vi.mocked(createAppointment).mock.calls[0]?.[3] as Record<
      string,
      unknown
    >;
    expect(input).not.toHaveProperty("organization_id");
    expect(input).not.toHaveProperty("lead_id");
    expect(input).not.toHaveProperty("user_id");
  });

  it("returns 404 for a cross-tenant lead and 422 for a cross-org assignee", async () => {
    vi.mocked(createAppointment).mockRejectedValue(new NotFoundError("Lead"));
    expect(
      (await POST(makePostRequest(BASE_PATH, { starts_at: STARTS_AT }), makeContext())).status
    ).toBe(404);

    vi.mocked(createAppointment).mockRejectedValue(
      new ValidationError("Invalid appointment data", {
        assigned_user_id: ["Assignee must be a member of this organization"],
      })
    );
    expect(
      (
        await POST(
          makePostRequest(BASE_PATH, {
            starts_at: STARTS_AT,
            assigned_user_id: "bbbbbbbb-0000-4000-8000-0000000000bb",
          }),
          makeContext()
        )
      ).status
    ).toBe(422);
  });
});
