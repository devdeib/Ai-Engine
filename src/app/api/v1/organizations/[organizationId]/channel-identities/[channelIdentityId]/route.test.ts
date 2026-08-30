/**
 * GET/PATCH /api/v1/organizations/:organizationId/channel-identities/:channelIdentityId
 *
 * Membership-gated. PATCH attaches an identity to an in-org lead. No secrets.
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
  getChannelIdentity: vi.fn(),
  attachChannelIdentityLead: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getChannelIdentity,
  attachChannelIdentityLead,
} from "@/modules/channels/identities";
import { GET, PATCH } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_LEAD = "22222222-2222-4222-8222-222222222222";
const INVALID_UUID = "not-a-uuid";
const PATH = `/api/v1/organizations/${ORG_A}/channel-identities/${IDENTITY_ID}`;

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
  id: IDENTITY_ID,
  organizationId: ORG_A,
  channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  externalAddress: "+9745550001",
  leadId: LEAD_ID,
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
  channelIdentityId = IDENTITY_ID
) {
  return { params: Promise.resolve({ organizationId, channelIdentityId }) };
}

describe("GET channel-identity by id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public shape for a member and omits secrets", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "agent" },
    });
    vi.mocked(getChannelIdentity).mockResolvedValue(publicIdentity);

    const res = await GET(makeGetRequest(PATH), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(publicIdentity);
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(body.data).not.toHaveProperty("updatedAt");
    expect(JSON.stringify(body)).not.toContain("webhook_secret");
    expect(JSON.stringify(body)).not.toContain("provider_access_token");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
    expect(getChannelIdentity).toHaveBeenCalledWith(ORG_A, USER_1, IDENTITY_ID);
  });

  it("returns 404 for a missing or foreign identity", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(getChannelIdentity).mockRejectedValue(
      new NotFoundError("Channel identity")
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
    expect(getChannelIdentity).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGetRequest(PATH), makeContext());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("TENANT_ACCESS_DENIED");
    expect(getChannelIdentity).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid UUID", async () => {
    const res = await GET(
      makeGetRequest(
        `/api/v1/organizations/${ORG_A}/channel-identities/${INVALID_UUID}`
      ),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(getChannelIdentity).not.toHaveBeenCalled();
  });
});

describe("PATCH channel-identity attach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows an agent/member to attach a lead", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "agent" },
    });
    vi.mocked(attachChannelIdentityLead).mockResolvedValue({
      ...publicIdentity,
      leadId: TARGET_LEAD,
    });

    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.leadId).toBe(TARGET_LEAD);
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(body.data).not.toHaveProperty("updatedAt");
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
    expect(attachChannelIdentityLead).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      IDENTITY_ID,
      TARGET_LEAD
    );
  });

  it("allows an owner to attach a lead", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(attachChannelIdentityLead).mockResolvedValue({
      ...publicIdentity,
      leadId: TARGET_LEAD,
    });

    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });

  it("allows an admin to attach a lead", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "admin" },
    });
    vi.mocked(attachChannelIdentityLead).mockResolvedValue({
      ...publicIdentity,
      leadId: TARGET_LEAD,
    });

    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(403);
    expect(attachChannelIdentityLead).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(401);
    expect(attachChannelIdentityLead).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid identity UUID", async () => {
    const res = await PATCH(
      makePatchRequest(
        `/api/v1/organizations/${ORG_A}/channel-identities/${INVALID_UUID}`,
        { leadId: TARGET_LEAD }
      ),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(attachChannelIdentityLead).not.toHaveBeenCalled();
  });

  it("returns 422 for an invalid lead UUID", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: INVALID_UUID }),
      makeContext()
    );
    expect(res.status).toBe(422);
    expect(attachChannelIdentityLead).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or foreign identity", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(attachChannelIdentityLead).mockRejectedValue(
      new NotFoundError("Channel identity")
    );
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a missing lead", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(attachChannelIdentityLead).mockRejectedValue(
      new NotFoundError("Lead")
    );
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for a foreign lead", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(attachChannelIdentityLead).mockRejectedValue(
      new NotFoundError("Lead")
    );
    const res = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD }),
      makeContext()
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 422 for extra fields, null leadId, and tenant injections", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);

    const empty = await PATCH(makePatchRequest(PATH, {}), makeContext());
    const extra = await PATCH(
      makePatchRequest(PATH, { leadId: TARGET_LEAD, channel: "sms" }),
      makeContext()
    );
    const nullLead = await PATCH(
      makePatchRequest(PATH, { leadId: null }),
      makeContext()
    );
    const orgInjection = await PATCH(
      makePatchRequest(PATH, {
        leadId: TARGET_LEAD,
        organizationId: "bbbbbbbb-0000-4000-8000-000000000002",
      }),
      makeContext()
    );
    const accountInjection = await PATCH(
      makePatchRequest(PATH, {
        leadId: TARGET_LEAD,
        channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      makeContext()
    );

    expect(empty.status).toBe(422);
    expect(extra.status).toBe(422);
    expect(nullLead.status).toBe(422);
    expect(orgInjection.status).toBe(422);
    expect(accountInjection.status).toBe(422);
    expect(attachChannelIdentityLead).not.toHaveBeenCalled();
  });
});
