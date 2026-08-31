/**
 * GET/PATCH /api/v1/organizations/:organizationId/sales-profile
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/organizations/sales-profile", () => ({
  getOrganizationSalesProfile: vi.fn(),
  upsertOrganizationSalesProfile: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getOrganizationSalesProfile,
  upsertOrganizationSalesProfile,
} from "@/modules/organizations/sales-profile";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";

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
const mockOrgContext = {
  user: mockUser,
  member: mockMember,
  organizationId: ORG_A,
};

const emptyProfile = {
  offering_summary: null,
  service_area: null,
  qualification_criteria: null,
  constraints: null,
  typical_next_step: null,
};

function makeGet(orgId = ORG_A) {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${orgId}/sales-profile`
  );
}

function makePatch(body: unknown, orgId = ORG_A) {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${orgId}/sales-profile`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET sales-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(ORG_B), {
      params: Promise.resolve({ organizationId: ORG_B }),
    });
    expect(res.status).toBe(403);
    expect(getOrganizationSalesProfile).not.toHaveBeenCalled();
  });

  it("returns an empty profile when none is configured", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(getOrganizationSalesProfile).mockResolvedValue(emptyProfile);
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(emptyProfile);
    expect(getOrganizationSalesProfile).toHaveBeenCalledWith(ORG_A, USER_1);
  });

  it("allows an agent to read", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "agent" },
    });
    vi.mocked(getOrganizationSalesProfile).mockResolvedValue(emptyProfile);
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(200);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });
});

describe("PATCH sales-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner or admin", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(makePatch({ offering_summary: "Villas" }), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(403);
    expect(upsertOrganizationSalesProfile).not.toHaveBeenCalled();
  });

  it("passes owner/admin roles into getOrgContext", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(upsertOrganizationSalesProfile).mockResolvedValue({
      ...emptyProfile,
      offering_summary: "Villas",
    });
    const res = await PATCH(makePatch({ offering_summary: "Villas" }), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(200);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
    expect(upsertOrganizationSalesProfile).toHaveBeenCalledWith(ORG_A, USER_1, {
      offering_summary: "Villas",
    });
  });

  it("returns 422 for oversized fields", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    const res = await PATCH(
      makePatch({ offering_summary: "x".repeat(2001) }),
      { params: Promise.resolve({ organizationId: ORG_A }) }
    );
    expect(res.status).toBe(422);
    expect(upsertOrganizationSalesProfile).not.toHaveBeenCalled();
  });

  it("does not forward a client organization_id", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(upsertOrganizationSalesProfile).mockResolvedValue(emptyProfile);
    await PATCH(
      makePatch({
        offering_summary: "Villas",
        organization_id: ORG_B,
      }),
      { params: Promise.resolve({ organizationId: ORG_A }) }
    );
    expect(upsertOrganizationSalesProfile).toHaveBeenCalledWith(ORG_A, USER_1, {
      offering_summary: "Villas",
    });
  });

  it("blocks a cross-tenant PATCH", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(makePatch({ offering_summary: "Stolen" }, ORG_B), {
      params: Promise.resolve({ organizationId: ORG_B }),
    });
    expect(res.status).toBe(403);
    expect(upsertOrganizationSalesProfile).not.toHaveBeenCalled();
  });
});
