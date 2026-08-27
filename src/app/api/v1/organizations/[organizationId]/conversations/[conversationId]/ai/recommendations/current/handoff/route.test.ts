/**
 * POST /conversations/:conversationId/ai/recommendations/current/handoff
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { ConversationWithLead, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/recommendation/handoff-request", () => ({
  requestHandoffFromRecommendation: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { requestHandoffFromRecommendation } from "@/modules/ai/recommendation/handoff-request";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";

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

const escalated: ConversationWithLead = {
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
};

function makePost(body: unknown) {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/recommendations/current/handoff`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const routeContext = {
  params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
};

describe("POST recommendation current handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(requestHandoffFromRecommendation).mockResolvedValue(escalated);
  });

  it("returns 200 with the existing conversation shape", async () => {
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(escalated);
    expect(body.data.requires_human).toBe(true);
    expect(body.data.ai_paused_at).toBeTruthy();
    expect(requestHandoffFromRecommendation).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(401);
    expect(requestHandoffFromRecommendation).not.toHaveBeenCalled();
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(403);
  });

  it("returns 404 when the current recommendation is missing", async () => {
    vi.mocked(requestHandoffFromRecommendation).mockRejectedValue(
      new NotFoundError("Recommendation")
    );
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the conversation is missing", async () => {
    vi.mocked(requestHandoffFromRecommendation).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the live recommendation is no longer valid", async () => {
    vi.mocked(requestHandoffFromRecommendation).mockRejectedValue(
      new ConflictError("This recommendation cannot escalate to a human")
    );
    const res = await POST(makePost({}), routeContext);
    expect(res.status).toBe(409);
  });

  it("returns 422 when an extra field is present", async () => {
    const res = await POST(
      makePost({ organizationId: ORG_A }),
      routeContext
    );
    expect(res.status).toBe(422);
    expect(requestHandoffFromRecommendation).not.toHaveBeenCalled();
  });
});
