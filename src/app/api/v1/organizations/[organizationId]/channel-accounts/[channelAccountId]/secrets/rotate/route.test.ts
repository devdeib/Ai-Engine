/**
 * POST .../channel-accounts/:channelAccountId/secrets/rotate
 *
 * Owner/admin only. Test rotation returns webhookSecret once.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import type { OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/channels/accounts", () => ({
  rotateChannelAccountSecrets: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { rotateChannelAccountSecrets } from "@/modules/channels/accounts";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INVALID_UUID = "not-a-uuid";
const PATH = `/api/v1/organizations/${ORG_A}/channel-accounts/${ACCOUNT_ID}/secrets/rotate`;

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
  channel: "whatsapp" as const,
  status: "active" as const,
  providerDestinationId: "123456789012345",
  createdAt: "2026-08-27T00:00:00Z",
};

function makePostRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
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

describe("POST channel-account secret rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns webhookSecret once for Test rotation", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(rotateChannelAccountSecrets).mockResolvedValue({
      ...publicAccount,
      channel: "test",
      providerDestinationId: "dest-1",
      webhookSecret: "n".repeat(64),
    });

    const res = await POST(makePostRequest(PATH, {}), makeContext());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.webhookSecret).toHaveLength(64);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
    expect(rotateChannelAccountSecrets).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      ACCOUNT_ID,
      {}
    );
  });

  it("does not return WhatsApp credentials", async () => {
    const accessToken = "EAAG." + "x".repeat(80);
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "admin" },
    });
    vi.mocked(rotateChannelAccountSecrets).mockResolvedValue(publicAccount);

    const res = await POST(
      makePostRequest(PATH, {
        access_token: accessToken,
        webhook_verify_token: "verify-me",
        app_secret: "s".repeat(32),
      }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(body)).not.toContain(accessToken);
    expect(JSON.stringify(body)).not.toContain("Bearer");
    expect(JSON.stringify(body)).not.toContain("verify-me");
    expect(JSON.stringify(body)).not.toContain("whsec_");
  });

  it("returns 403 for an agent", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePostRequest(PATH, {}), makeContext());
    expect(res.status).toBe(403);
    expect(rotateChannelAccountSecrets).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(makePostRequest(PATH, {}), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 403 for an outsider", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePostRequest(PATH, {}), makeContext());
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("TENANT_ACCESS_DENIED");
  });

  it("returns 404 for a missing or cross-tenant account", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(rotateChannelAccountSecrets).mockRejectedValue(
      new NotFoundError("Channel account")
    );
    const res = await POST(makePostRequest(PATH, {}), makeContext());
    expect(res.status).toBe(404);
  });

  it("returns 422 for invalid credentials without leaking them", async () => {
    const secret = `whsec_${"c".repeat(32)}`;
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(rotateChannelAccountSecrets).mockRejectedValue(
      new ValidationError("Invalid channel account data", {
        webhook_signing_secret: ["Webhook signing secret is invalid"],
      })
    );

    const res = await POST(
      makePostRequest(PATH, {
        access_token: "Bearer leaked-token",
        webhook_signing_secret: secret,
      }),
      makeContext()
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(JSON.stringify(body)).not.toContain("Bearer");
    expect(JSON.stringify(body)).not.toContain("leaked-token");
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain("whsec_");
  });

  it("returns 422 for an invalid UUID", async () => {
    const res = await POST(
      makePostRequest(
        `/api/v1/organizations/${ORG_A}/channel-accounts/${INVALID_UUID}/secrets/rotate`,
        {}
      ),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(getOrgContext).not.toHaveBeenCalled();
    expect(rotateChannelAccountSecrets).not.toHaveBeenCalled();
  });
});
