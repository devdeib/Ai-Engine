/**
 * Operator channel-identity APIs. Membership-gated. No secrets.
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
vi.mock("@/modules/channels/identities", () => ({
  listChannelIdentities: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listChannelIdentities } from "@/modules/channels/identities";
import { GET } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATH = `/api/v1/organizations/${ORG_A}/channel-identities`;

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

const publicIdentity = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  organizationId: ORG_A,
  channelAccountId: ACCOUNT_ID,
  externalAddress: "+9745550001",
  leadId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-08-27T00:00:00Z",
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

describe("GET /organizations/:organizationId/channel-identities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(401);
    expect(listChannelIdentities).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    expect(res.status).toBe(403);
    expect(listChannelIdentities).not.toHaveBeenCalled();
  });

  it("lists identities for the authenticated organization with default pagination", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelIdentities).mockResolvedValue([publicIdentity]);

    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      data: [publicIdentity],
      meta: { page: 1, limit: 20, count: 1 },
    });
    expect(listChannelIdentities).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { channelAccountId: undefined }
    );
    expect(body.data[0]).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(body)).not.toContain("webhook_secret");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("forwards pagination and account filter from the query string", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelIdentities).mockResolvedValue([]);

    const res = await GET(
      makeGet({ page: "2", limit: "10", channel_account_id: ACCOUNT_ID }),
      { params: Promise.resolve({ organizationId: ORG_A }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.meta).toEqual({ page: 2, limit: 10, count: 0 });
    expect(listChannelIdentities).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 2, limit: 10 },
      { channelAccountId: ACCOUNT_ID }
    );
  });
});
