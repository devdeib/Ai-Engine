/**
 * GET /api/v1/organizations/:organizationId/channel-identities/:id/match-candidates
 *
 * Membership-gated. Read-only. Public candidate shape only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/channels/identities", () => ({
  listChannelIdentityMatchCandidates: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listChannelIdentityMatchCandidates } from "@/modules/channels/identities";
import { GET } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const INVALID_UUID = "not-a-uuid";
const PATH = `/api/v1/organizations/${ORG_A}/channel-identities/${IDENTITY_ID}/match-candidates`;

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

const publicCandidate = {
  id: "11111111-1111-4111-8111-111111111111",
  firstName: "Ahmed",
  lastName: "Ali",
  email: "ahmed@example.com",
  phone: "+97455551234",
  companyName: "Acme",
  status: "new" as const,
};

function makeGet(searchParams?: Record<string, string>) {
  const url = new URL(`http://localhost:3000${PATH}`);
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  }
  return new NextRequest(url, { method: "GET" });
}

function makeContext(
  organizationId = ORG_A,
  channelIdentityId = IDENTITY_ID
) {
  return { params: Promise.resolve({ organizationId, channelIdentityId }) };
}

function orgContextWithRole(role: OrganizationMember["role"]) {
  return {
    ...mockOrgContext,
    member: { ...mockMember, role },
  };
}

describe("GET channel-identity match-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["agent", "owner", "admin"] as const)(
    "returns 200 for an authenticated %s",
    async (role) => {
      vi.mocked(getOrgContext).mockResolvedValue(orgContextWithRole(role));
      vi.mocked(listChannelIdentityMatchCandidates).mockResolvedValue([
        publicCandidate,
      ]);

      const res = await GET(makeGet(), makeContext());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        data: [publicCandidate],
        meta: { page: 1, limit: 20, count: 1 },
      });
      expect(Object.keys(body.data[0]).sort()).toEqual(
        [
          "companyName",
          "email",
          "firstName",
          "id",
          "lastName",
          "phone",
          "status",
        ].sort()
      );
      expect(body.data[0]).not.toHaveProperty("notes");
      expect(body.data[0]).not.toHaveProperty("score");
      expect(body.data[0]).not.toHaveProperty("owner_id");
      expect(JSON.stringify(body)).not.toContain("secret");
      expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
      expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
      expect(listChannelIdentityMatchCandidates).toHaveBeenCalledWith(
        ORG_A,
        USER_1,
        IDENTITY_ID,
        { page: 1, limit: 20 }
      );
    }
  );

  it("returns 200 with an empty candidate list", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelIdentityMatchCandidates).mockResolvedValue([]);

    const res = await GET(makeGet(), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      data: [],
      meta: { page: 1, limit: 20, count: 0 },
    });
  });

  it("forwards pagination", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelIdentityMatchCandidates).mockResolvedValue([]);

    const res = await GET(makeGet({ page: "2", limit: "10" }), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ page: 2, limit: 10, count: 0 });
    expect(listChannelIdentityMatchCandidates).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      IDENTITY_ID,
      { page: 2, limit: 10 }
    );
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(), makeContext());
    expect(res.status).toBe(401);
    expect(listChannelIdentityMatchCandidates).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(), makeContext());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("TENANT_ACCESS_DENIED");
    expect(listChannelIdentityMatchCandidates).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid identity UUID before auth", async () => {
    const res = await GET(
      makeGet(),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(listChannelIdentityMatchCandidates).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or foreign identity", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelIdentityMatchCandidates).mockRejectedValue(
      new NotFoundError("Channel identity")
    );

    const res = await GET(makeGet(), makeContext());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
