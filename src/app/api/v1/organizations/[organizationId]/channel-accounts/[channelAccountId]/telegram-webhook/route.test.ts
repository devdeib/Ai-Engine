/**
 * POST .../channel-accounts/:channelAccountId/telegram-webhook
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
vi.mock("@/modules/channels/adapters/telegram/setup", () => ({
  setupTelegramChannelWebhook: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { setupTelegramChannelWebhook } from "@/modules/channels/adapters/telegram/setup";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PATH = `/api/v1/organizations/${ORG_A}/channel-accounts/${ACCOUNT_ID}/telegram-webhook`;
const BOT_TOKEN = "123456:AA" + "z".repeat(30);

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

function makePostRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000${PATH}`, { method: "POST" });
}

describe("POST channel-account Telegram webhook setup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the webhook for owner/admin and never returns secrets", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(setupTelegramChannelWebhook).mockResolvedValue({ registered: true });

    const res = await POST(makePostRequest(), {
      params: Promise.resolve({ organizationId: ORG_A, channelAccountId: ACCOUNT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ registered: true });
    expect(JSON.stringify(body)).not.toContain(BOT_TOKEN);
    expect(JSON.stringify(body)).not.toContain("webhookSecret");
    expect(setupTelegramChannelWebhook).toHaveBeenCalledWith(ORG_A, USER_1, ACCOUNT_ID);
    expect(getOrgContext).toHaveBeenCalledWith(expect.any(NextRequest), ORG_A, [
      "owner",
      "admin",
    ]);
  });

  it("returns 403 for an agent", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePostRequest(), {
      params: Promise.resolve({ organizationId: ORG_A, channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(403);
    expect(setupTelegramChannelWebhook).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(makePostRequest(), {
      params: Promise.resolve({ organizationId: ORG_A, channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a missing account", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(setupTelegramChannelWebhook).mockRejectedValue(
      new NotFoundError("Channel account")
    );
    const res = await POST(makePostRequest(), {
      params: Promise.resolve({ organizationId: ORG_A, channelAccountId: ACCOUNT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 422 for a non-Telegram account without leaking credentials", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(setupTelegramChannelWebhook).mockRejectedValue(
      new ValidationError("Invalid channel account data", {
        channel: ["Webhook setup is only available for Telegram accounts"],
      })
    );
    const res = await POST(makePostRequest(), {
      params: Promise.resolve({ organizationId: ORG_A, channelAccountId: ACCOUNT_ID }),
    });
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(JSON.stringify(body)).not.toContain(BOT_TOKEN);
  });
});
