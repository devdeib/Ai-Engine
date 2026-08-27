import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { ConversationWithLead, OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  escalateToHuman: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { escalateToHuman } from "@/modules/ai/handoff";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/escalate`;

const mockOrgContext = {
  user: { id: USER_1 } as unknown as User,
  member: {
    id: "ffffffff-0000-0000-0000-000000000001",
    organization_id: ORG_A,
    user_id: USER_1,
    role: "agent",
    invited_by: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
  } satisfies OrganizationMember,
  organizationId: ORG_A,
};

function makePost() {
  return new NextRequest(`http://localhost:3000${BASE_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

const context = {
  params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
};

describe("POST /conversations/:id/ai/escalate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    expect((await POST(makePost(), context)).status).toBe(401);
  });

  it("returns 403 when not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    expect((await POST(makePost(), context)).status).toBe(403);
  });

  it("returns 200 and escalates with trusted ids", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(escalateToHuman).mockResolvedValue({
      id: CONV_1,
      organization_id: ORG_A,
      lead_id: LEAD_1,
      channel: "in_app",
      status: "open",
      requires_human: true,
      ai_paused_at: "2026-08-21T12:00:00Z",
      channel_account_id: null,
      channel_identity_id: null,
      created_at: "2026-08-20T10:00:00Z",
      updated_at: "2026-08-21T12:00:00Z",
      lead: { id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: null },
    } satisfies ConversationWithLead);
    const res = await POST(makePost(), context);
    expect(res.status).toBe(200);
    expect(escalateToHuman).toHaveBeenCalledWith(ORG_A, USER_1, CONV_1);
  });
});
