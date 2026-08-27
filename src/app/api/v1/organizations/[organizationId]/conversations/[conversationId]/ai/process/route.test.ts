/**
 * POST /api/v1/organizations/:organizationId/conversations/:conversationId/ai/process
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  TenantAccessError,
} from "@/lib/errors";
import { AiProviderError } from "@/modules/ai/errors";
import type { OrganizationMember } from "@/lib/db/types";
import type { User } from "@supabase/auth-js";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { processConversationMessage } from "@/modules/ai/service";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INVALID_UUID = "not-a-uuid";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/process`;

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

function makePost(path: string, body: unknown = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(
  organizationId: string = ORG_A,
  conversationId: string = CONV_1
) {
  return { params: Promise.resolve({ organizationId, conversationId }) };
}

describe("POST /conversations/:id/ai/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await POST(makePost(BASE_PATH), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await POST(makePost(BASE_PATH), makeContext());
    expect(res.status).toBe(403);
  });

  it("returns 422 for an invalid conversation id", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    const res = await POST(
      makePost(
        `/api/v1/organizations/${ORG_A}/conversations/${INVALID_UUID}/ai/process`
      ),
      makeContext(ORG_A, INVALID_UUID)
    );
    expect(res.status).toBe(422);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or cross-tenant conversation", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    const res = await POST(makePost(BASE_PATH), makeContext());
    expect(res.status).toBe(404);
  });

  it("returns 409 when a duplicate AI reply already exists", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockRejectedValue(
      new ConflictError("An AI reply already exists for this message")
    );
    const res = await POST(makePost(BASE_PATH), makeContext());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).not.toContain("23505");
  });

  it("returns 502 without provider internals when the LLM fails", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockRejectedValue(new AiProviderError());
    const res = await POST(makePost(BASE_PATH), makeContext());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.message).not.toContain("sk-");
    expect(body.error.message).not.toContain("stack");
  });

  it("returns 200 with a skipped outcome when AI is not eligible", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "skipped",
      reason: "paused",
    });
    const res = await POST(makePost(BASE_PATH), makeContext());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ outcome: "skipped", reason: "paused" });
  });

  it("returns 200 with an escalated outcome when a human is required", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "escalated",
      reason: "requires_human",
    });
    const res = await POST(makePost(BASE_PATH), makeContext());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      outcome: "escalated",
      reason: "requires_human",
    });
  });

  it("passes trusted org and user ids, ignoring forged body identity", async () => {
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "responded",
      messageId: "22222222-0000-4000-8000-0000000000bb",
      activityId: "33333333-0000-4000-8000-0000000000cc",
    });

    await POST(
      makePost(BASE_PATH, {
        organization_id: "bbbbbbbb-0000-0000-0000-000000000002",
        user_id: "ffffffff-0000-4000-8000-000000000099",
        actor_type: "human",
      }),
      makeContext()
    );

    expect(processConversationMessage).toHaveBeenCalledWith(
      ORG_A,
      CONV_1,
      { kind: "operator", userId: USER_1 }
    );
  });
});

