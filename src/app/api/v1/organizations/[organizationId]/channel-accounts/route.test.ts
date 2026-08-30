/**
 * Operator channel-account APIs. Membership-gated. Secret returned once.
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
vi.mock("@/modules/channels/accounts", () => ({
  createChannelAccount: vi.fn(),
  createTestChannelAccount: vi.fn(),
  listChannelAccounts: vi.fn(),
  getChannelAccount: vi.fn(),
  updateChannelAccountStatus: vi.fn(),
  rotateChannelAccountSecrets: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  createChannelAccount,
  listChannelAccounts,
} from "@/modules/channels/accounts";
import { GET, POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const PATH = `/api/v1/organizations/${ORG_A}/channel-accounts`;

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

describe("organization channel-accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_destination_id: "dest-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const req = new NextRequest(`http://localhost:3000${PATH}`);
    const res = await GET(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(403);
  });

  it("returns the webhook secret exactly once on create", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createChannelAccount).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: ORG_A,
      channel: "test",
      status: "active",
      providerDestinationId: "dest-1",
      createdAt: "2026-08-27T00:00:00Z",
      webhookSecret: "s".repeat(64),
    });
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_destination_id: "dest-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.webhookSecret).toHaveLength(64);
    expect(createChannelAccount).toHaveBeenCalledWith(ORG_A, USER_1, {
      channel: "test",
      provider_destination_id: "dest-1",
    });
  });

  it("lists accounts without secrets", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listChannelAccounts).mockResolvedValue([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        organizationId: ORG_A,
        channel: "test",
        status: "active",
        providerDestinationId: "dest-1",
        createdAt: "2026-08-27T00:00:00Z",
      },
    ]);
    const req = new NextRequest(`http://localhost:3000${PATH}`);
    const res = await GET(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0]).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(body)).not.toContain("webhook_secret");
    expect(JSON.stringify(body)).not.toContain("provider_access_token");
    expect(JSON.stringify(body)).not.toContain("webhook_verify_token");
    expect(JSON.stringify(body)).not.toContain("access_token");
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });

  it("allows an agent to list accounts", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "agent" },
    });
    vi.mocked(listChannelAccounts).mockResolvedValue([]);
    const req = new NextRequest(`http://localhost:3000${PATH}`);
    const res = await GET(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(200);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A);
    expect(vi.mocked(getOrgContext).mock.calls[0]?.[2]).toBeUndefined();
  });

  it("requires owner or admin to create and returns 403 for an agent", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_destination_id: "dest-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(403);
    expect(createChannelAccount).not.toHaveBeenCalled();
  });

  it("allows an owner to create", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createChannelAccount).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: ORG_A,
      channel: "test",
      status: "active",
      providerDestinationId: "dest-1",
      createdAt: "2026-08-27T00:00:00Z",
      webhookSecret: "s".repeat(64),
    });
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_destination_id: "dest-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(201);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
  });

  it("allows an admin to create", async () => {
    vi.mocked(getOrgContext).mockResolvedValue({
      ...mockOrgContext,
      member: { ...mockMember, role: "admin" },
    });
    vi.mocked(createChannelAccount).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: ORG_A,
      channel: "test",
      status: "active",
      providerDestinationId: "dest-1",
      createdAt: "2026-08-27T00:00:00Z",
      webhookSecret: "s".repeat(64),
    });
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_destination_id: "dest-1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    expect(res.status).toBe(201);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
  });

  it("does not return WhatsApp secrets on create", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(createChannelAccount).mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: ORG_A,
      channel: "whatsapp",
      status: "active",
      providerDestinationId: "123456789012345",
      createdAt: "2026-08-27T00:00:00Z",
    });
    const req = new NextRequest(`http://localhost:3000${PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
        access_token: "EAAG." + "x".repeat(80),
        webhook_verify_token: "verify-me",
        app_secret: "s".repeat(32),
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ organizationId: ORG_A }) });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(body)).not.toContain("EAAG");
    expect(JSON.stringify(body)).not.toContain("verify-me");
    expect(JSON.stringify(body)).not.toContain("app_secret");
  });
});
