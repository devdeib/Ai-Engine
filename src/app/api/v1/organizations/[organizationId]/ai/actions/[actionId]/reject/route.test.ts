/**
 * POST /api/v1/organizations/:organizationId/ai/actions/:actionId/reject
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { ConflictError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { AiToolAction, AiToolActionWithLead, OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/actions/write", () => ({
  executeCreateFollowUp: vi.fn(),
  requestCreateAppointment: vi.fn(),
  approveAiToolAction: vi.fn(),
  rejectAiToolAction: vi.fn(),
}));

vi.mock("@/modules/ai/actions/queries", () => ({
  listAiToolActions: vi.fn(),
  getAiToolAction: vi.fn(),
  loadAiToolActionRow: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { rejectAiToolAction } from "@/modules/ai/actions/write";
import { getAiToolAction } from "@/modules/ai/actions/queries";
import { POST } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_2 = "00000000-0000-4000-8000-000000000002";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

const mockApprover = { id: USER_2, email: "approver@example.com" } as unknown as User;
const mockMember: OrganizationMember = {
  id: "ffffffff-0000-0000-0000-000000000002",
  organization_id: ORG_A,
  user_id: USER_2,
  role: "owner",
  invited_by: null,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};
const mockOrgContext = {
  user: mockApprover,
  member: mockMember,
  organizationId: ORG_A,
};

function makeRow(
  overrides: Partial<AiToolActionWithLead> = {}
): AiToolActionWithLead {
  return {
    id: ACTION_1,
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: "11111111-0000-4000-8000-0000000000aa",
    tool_name: "create_appointment",
    trust: "human_approval",
    status: "rejected",
    input_hash: "a".repeat(64),
    payload: { startsAt: "2026-08-22T10:00:00.000Z" },
    result_summary: { status: "rejected" },
    result_resource_type: null,
    result_resource_id: null,
    requested_by_user_id: USER_2,
    trigger_source: "operator",
    channel_identity_id: null,
    approved_by_user_id: USER_2,
    decided_at: "2026-08-22T09:05:00Z",
    executed_at: null,
    expires_at: "2026-08-23T10:00:00.000Z",
    error_code: null,
    created_at: "2026-08-22T09:00:00Z",
    updated_at: "2026-08-22T09:05:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function makePost(path: string, body: unknown = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeContext(organizationId = ORG_A, actionId = ACTION_1) {
  return { params: Promise.resolve({ organizationId, actionId }) };
}

describe("POST /ai/actions/:actionId/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(rejectAiToolAction).mockResolvedValue({} as AiToolAction);
    vi.mocked(getAiToolAction).mockResolvedValue(makeRow());
  });

  it("rejects with an optional reason", async () => {
    const res = await POST(
      makePost(`/api/v1/organizations/${ORG_A}/ai/actions/${ACTION_1}/reject`, {
        reason: "Not this week",
      }),
      makeContext()
    );
    expect(res.status).toBe(200);
    expect(rejectAiToolAction).toHaveBeenCalledWith(
      ORG_A,
      USER_2,
      ACTION_1,
      "Not this week"
    );
  });

  it("returns 422 for unknown reject fields", async () => {
    const res = await POST(
      makePost(`/api/v1/organizations/${ORG_A}/ai/actions/${ACTION_1}/reject`, {
        status: "rejected",
        organization_id: ORG_A,
      }),
      makeContext()
    );
    expect(res.status).toBe(422);
    expect(rejectAiToolAction).not.toHaveBeenCalled();
  });

  it("returns 422 for invalid reason", async () => {
    const res = await POST(
      makePost(`/api/v1/organizations/${ORG_A}/ai/actions/${ACTION_1}/reject`, {
        reason: "x".repeat(501),
      }),
      makeContext()
    );
    expect(res.status).toBe(422);
  });

  it("returns 409 when already decided", async () => {
    vi.mocked(rejectAiToolAction).mockRejectedValue(
      new ConflictError("This action has already been decided")
    );
    const res = await POST(
      makePost(`/api/v1/organizations/${ORG_A}/ai/actions/${ACTION_1}/reject`, {}),
      makeContext()
    );
    expect(res.status).toBe(409);
  });

  it("returns 422 for invalid action id", async () => {
    const res = await POST(
      makePost(`/api/v1/organizations/${ORG_A}/ai/actions/not-a-uuid/reject`, {}),
      makeContext(ORG_A, "not-a-uuid")
    );
    expect(res.status).toBe(422);
    expect(rejectAiToolAction).not.toHaveBeenCalled();
  });
});
