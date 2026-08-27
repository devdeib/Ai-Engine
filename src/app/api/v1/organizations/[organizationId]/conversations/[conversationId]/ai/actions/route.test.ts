/**
 * GET /conversations/:conversationId/ai/actions
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/actions/queries", () => ({
  listAiToolActions: vi.fn(),
  getAiToolAction: vi.fn(),
  loadAiToolActionRow: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { listAiToolActions } from "@/modules/ai/actions/queries";
import { GET } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

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

describe("GET /conversations/:conversationId/ai/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(listAiToolActions).mockResolvedValue([]);
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(
      new NextRequest(
        `http://localhost/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/actions`
      ),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    expect(res.status).toBe(403);
  });

  it("scopes the list to the conversation and organization", async () => {
    const res = await GET(
      new NextRequest(
        `http://localhost/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/actions?status=pending`
      ),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    expect(res.status).toBe(200);
    expect(listAiToolActions).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { status: "pending", conversationId: CONV_1 }
    );
  });

  it("returns 422 for an invalid conversation id", async () => {
    const res = await GET(
      new NextRequest(
        `http://localhost/api/v1/organizations/${ORG_A}/conversations/not-a-uuid/ai/actions`
      ),
      {
        params: Promise.resolve({
          organizationId: ORG_A,
          conversationId: "not-a-uuid",
        }),
      }
    );
    expect(res.status).toBe(422);
    expect(listAiToolActions).not.toHaveBeenCalled();
  });
});
