/**
 * GET/PATCH /api/v1/organizations/:organizationId
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
vi.mock("@/modules/organizations/queries", () => ({
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getOrganization,
  updateOrganization,
} from "@/modules/organizations/queries";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
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

const org = {
  id: ORG_A,
  name: "Acme Realty",
  slug: "acme",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
  role: "owner" as const,
};

function makePatch(body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${ORG_A}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("PATCH organization name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await PATCH(makePatch({ name: "New Name" }), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(401);
  });

  it("requires owner or admin", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(makePatch({ name: "New Name" }), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(403);
    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it("updates the name for an owner", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(updateOrganization).mockResolvedValue({
      ...org,
      name: "Marina Homes",
    });
    const res = await PATCH(makePatch({ name: "Marina Homes" }), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
    expect(updateOrganization).toHaveBeenCalledWith(ORG_A, USER_1, {
      name: "Marina Homes",
    });
    expect(body.data.name).toBe("Marina Homes");
  });
});

describe("GET organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the organization for a member", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(getOrganization).mockResolvedValue(org);
    const req = new NextRequest(
      `http://localhost:3000/api/v1/organizations/${ORG_A}`
    );
    const res = await GET(req, {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(200);
    expect(getOrganization).toHaveBeenCalledWith(ORG_A, USER_1);
  });
});
