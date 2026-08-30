/**
 * GET/PATCH /api/v1/organizations/:organizationId/channel-accounts/:channelAccountId
 *
 * GET is membership-gated. PATCH is owner/admin only. Secrets never returned.
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
vi.mock("@/modules/channels/accounts", () => ({
  getChannelAccount: vi.fn(),
  updateChannelAccountStatus: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getChannelAccount,
  updateChannelAccountStatus,
} from "@/modules/channels/accounts";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVALID_UUID = "not-a-uuid";
const PATH = `/api/v1/organizations/${ORG_A}/channel-accounts/${ACCOUNT_ID}`;

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

const publicAccount = {
  id: ACCOUNT_ID,
  organizationId: ORG_A,
  channel: "test" as const,
  status: "active" as const,
  providerDestinationId: "dest-1",
  createdAt: "2026-08-27T00:00:00Z",
};

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

function makeContext(
  organizationId = ORG_A,
  channelAccountId = ACCOUNT_ID
) {
  return { params: Promise.resolve({ organizationId, channelAccountId }) };
}

describe("GET channel-account by id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public shape for a member and omits secrets", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "agent" },
    });
    vi.mocked(getChannelAccount).mockResolvedValue(publicAccount);

    const res = await GET(makeGetRequest(PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(publicAccount);
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(body.data).not.toHaveProperty("updatedAt");
    expect(JSON.stringify(body)).not.toContain("webhook_secret");
    expect(JSON.stringify(body)).not.toContain("provider_access_token");
    expect(JSON.stringify(body)).not.toContain("access_token");
    expect(JSON.stringify(body)).not.toContain("app_secret");
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });

  it("returns 404 for a missing or foreign account", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(getChannelAccount).mockRejectedValue(
      new NotFoundError("Channel account")
    );

    const missing = await GET(makeGetRequest(PATH), makeContext());
    expect(missing.status).toBe(404);
    const missingBody = await missing.json();
    expect(missingBody.error.code).toBe("NOT_FOUND");
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGetRequest(PATH), makeContext());
    expect(res.status).toBe(401);
    expect(getChannelAccount).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGetRequest(PATH), makeContext());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("TENANT_ACCESS_DENIED");
    expect(getChannelAccount).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid UUID", async () => {
    const res = await GET(
      makeGetRequest(`/api/v1/organizations/${ORG_A}/channel-accounts/${INVALID_UUID}`),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(getChannelAccount).not.toHaveBeenCalled();
  });
});

describe("PATCH channel-account status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows owner and admin to change status", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(updateChannelAccountStatus).mockResolvedValue({
      ...publicAccount,
      status: "paused",
    });

    const res = await PATCH(
      makePatchRequest(PATH, { status: "paused" }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("paused");
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
    expect(updateChannelAccountStatus).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      ACCOUNT_ID,
      { status: "paused" }
    );
  });

  it("allows an admin to patch and is idempotent for the same status", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "admin" },
    });
    vi.mocked(updateChannelAccountStatus).mockResolvedValue({
      ...publicAccount,
      status: "active",
    });

    const res = await PATCH(
      makePatchRequest(PATH, { status: "active" }),
      makeContext()
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("active");
  });

  it("returns 422 for extra keys or an invalid status", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);

    const extra = await PATCH(
      makePatchRequest(PATH, { status: "paused", channel: "sms" }),
      makeContext()
    );
    const invalid = await PATCH(
      makePatchRequest(PATH, { status: "archived" }),
      makeContext()
    );

    expect(extra.status).toBe(422);
    expect(invalid.status).toBe(422);
    expect(updateChannelAccountStatus).not.toHaveBeenCalled();
  });

  it("returns 403 for an agent", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(
      makePatchRequest(PATH, { status: "paused" }),
      makeContext()
    );
    expect(res.status).toBe(403);
    expect(updateChannelAccountStatus).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await PATCH(
      makePatchRequest(PATH, { status: "paused" }),
      makeContext()
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 for a missing account", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(updateChannelAccountStatus).mockRejectedValue(
      new NotFoundError("Channel account")
    );
    const res = await PATCH(
      makePatchRequest(PATH, { status: "paused" }),
      makeContext()
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 for an invalid UUID", async () => {
    const res = await PATCH(
      makePatchRequest(
        `/api/v1/organizations/${ORG_A}/channel-accounts/${INVALID_UUID}`,
        { status: "paused" }
      ),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
  });
});
