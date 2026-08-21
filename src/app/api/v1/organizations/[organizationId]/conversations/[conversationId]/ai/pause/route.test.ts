import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { ConversationWithLead, OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  pauseAI: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { pauseAI } from "@/modules/ai/handoff";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/pause`;

const mockUser = { id: USER_1 } as unknown as User;
const mockMember: OrganizationMember = {
  id: "ffffffff-0000-0000-0000-000000000001",
  organization_id: ORG_A,
  user_id: USER_1,
  role: "agent",
  invited_by: null,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};
const mockOrgContext = { user: mockUser, member: mockMember, organizationId: ORG_A };

function conversation(): ConversationWithLead {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: "2026-08-21T12:00:00Z",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-21T12:00:00Z",
    lead: { id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: null },
  };
}

function makePost(body: unknown = {}) {
  return new NextRequest(`http://localhost:3000${BASE_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) };

describe("POST /conversations/:id/ai/pause", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect((await POST(makePost(), context)).status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect((await POST(makePost(), context)).status).toBe(403);
  });

  it("returns 404 for a cross-tenant conversation", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(pauseAI).mockRejectedValue(new NotFoundError("Conversation"));
    expect((await POST(makePost(), context)).status).toBe(404);
  });

  it("returns 200 and ignores forged body identity", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(pauseAI).mockResolvedValue(conversation());
    const res = await POST(
      makePost({ organization_id: "other", ai_paused_at: null }),
      context
    );
    expect(res.status).toBe(200);
    expect(pauseAI).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1);
  });
});
