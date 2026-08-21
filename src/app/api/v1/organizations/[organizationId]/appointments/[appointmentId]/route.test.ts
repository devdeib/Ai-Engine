/**
 * Tests for GET/PATCH /api/v1/organizations/:organizationId/appointments/:appointmentId
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
import type { Appointment, AppointmentWithLead, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/appointments/queries", () => ({
  getAppointment: vi.fn(),
  listAppointments: vi.fn(),
  listLeadAppointments: vi.fn(),
}));

vi.mock("@/modules/appointments/actions", () => ({
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { getAppointment } from "@/modules/appointments/queries";
import { updateAppointment } from "@/modules/appointments/actions";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const APPT_1 = "aaaaaaaa-0000-4000-8000-0000000000aa";
const INVALID_ID = "not-a-uuid";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/appointments/${APPT_1}`;

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
    id: APPT_1,
    organization_id: ORG_A,
    lead_id: "11111111-1111-4111-8111-111111111111",
    assigned_user_id: null,
    starts_at: "2026-08-22T10:00:00Z",
    ends_at: null,
    status: "scheduled",
    location: null,
    notes: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    lead: {
      id: "11111111-1111-4111-8111-111111111111",
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function makeGetRequest(path: string) {
  return new NextRequest(`http://localhost${path}`, { method: "GET" });
}

function makePatchRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId = ORG_A, appointmentId = APPT_1) {
  return { params: Promise.resolve({ organizationId, appointmentId }) };
}

describe("GET /appointments/:appointmentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 401 / 403", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(401);
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(403);
  });

  it("returns 422 for a malformed UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/appointments/${INVALID_ID}`),
      makeContext(ORG_A, INVALID_ID)
    );
    expect(res.status).toBe(422);
    expect(getAppointment).not.toHaveBeenCalled();
  });

  it("returns 200 for an in-org appointment", async () => {
    vi.mocked(getAppointment).mockResolvedValue(makeAppointment());
    const res = await GET(makeGetRequest(BASE_PATH), makeContext());
    const body = (await res.json()) as { data: AppointmentWithLead };
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(APPT_1);
    expect(getAppointment).toHaveBeenCalledWith(ORG_A, USER_1, APPT_1);
  });

  it("returns 404 for a cross-tenant appointment", async () => {
    vi.mocked(getAppointment).mockRejectedValue(new NotFoundError("Appointment"));
    expect((await GET(makeGetRequest(BASE_PATH), makeContext())).status).toBe(404);
  });
});

describe("PATCH /appointments/:appointmentId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
  });

  it("returns 401 / 403", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect(
      (await PATCH(makePatchRequest(BASE_PATH, { status: "completed" }), makeContext()))
        .status
    ).toBe(401);
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect(
      (await PATCH(makePatchRequest(BASE_PATH, { status: "completed" }), makeContext()))
        .status
    ).toBe(403);
  });

  it("returns 422 for malformed UUID, empty body, invalid status, and bad range", async () => {
    expect(
      (
        await PATCH(
          makePatchRequest(
            `/api/v1/organizations/${ORG_A}/appointments/${INVALID_ID}`,
            { status: "completed" }
          ),
          makeContext(ORG_A, INVALID_ID)
        )
      ).status
    ).toBe(422);
    expect((await PATCH(makePatchRequest(BASE_PATH, {}), makeContext())).status).toBe(
      422
    );
    expect(
      (await PATCH(makePatchRequest(BASE_PATH, { status: "scheduled" }), makeContext()))
        .status
    ).toBe(422);
    expect(
      (
        await PATCH(
          makePatchRequest(BASE_PATH, {
            starts_at: "2026-08-22T10:00:00Z",
            ends_at: "2026-08-22T10:00:00Z",
          }),
          makeContext()
        )
      ).status
    ).toBe(422);
  });

  it("returns 200 on complete and strips forged organization_id", async () => {
    vi.mocked(updateAppointment).mockResolvedValue(
      makeAppointment({ status: "completed" }) as Appointment
    );
    const res = await PATCH(
      makePatchRequest(BASE_PATH, { status: "completed", organization_id: ORG_B }),
      makeContext()
    );
    const body = (await res.json()) as { data: Appointment };
    expect(res.status).toBe(200);
    expect(body.data.status).toBe("completed");
    const input = vi.mocked(updateAppointment).mock.calls[0]?.[3] as Record<
      string,
      unknown
    >;
    expect(input).not.toHaveProperty("organization_id");
  });

  it("returns 404 for cross-tenant and 422 for invalid lifecycle", async () => {
    vi.mocked(updateAppointment).mockRejectedValue(
      new NotFoundError("Appointment")
    );
    expect(
      (await PATCH(makePatchRequest(BASE_PATH, { status: "completed" }), makeContext()))
        .status
    ).toBe(404);

    vi.mocked(updateAppointment).mockRejectedValue(
      new ValidationError("Invalid appointment data", {
        status: ["Only scheduled appointments can be updated"],
      })
    );
    expect(
      (await PATCH(makePatchRequest(BASE_PATH, { status: "completed" }), makeContext()))
        .status
    ).toBe(422);
  });
});
