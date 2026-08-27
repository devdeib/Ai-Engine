/**
 * GET /api/v1/organizations/:organizationId/ai/actions
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { AiToolActionWithLead, OrganizationMember } from "@/lib/db/types";

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
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/ai/actions`;

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

function makeAction(
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
    status: "pending",
    input_hash: "a".repeat(64),
    payload: {
      startsAt: "2026-08-22T10:00:00.000Z",
      endsAt: null,
      location: "West Bay",
    },
    result_summary: {
      status: "pending_approval",
      startsAt: "2026-08-22T10:00:00.000Z",
      endsAt: null,
      location: "West Bay",
    },
    result_resource_type: null,
    result_resource_id: null,
    requested_by_user_id: USER_1,
    trigger_source: "operator",
    channel_identity_id: null,
    approved_by_user_id: null,
    decided_at: null,
    executed_at: null,
    expires_at: "2026-08-23T10:00:00.000Z",
    error_code: null,
    created_at: "2026-08-22T09:00:00Z",
    updated_at: "2026-08-22T09:00:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function makeGet(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function makeContext(organizationId = ORG_A) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("GET /ai/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(listAiToolActions).mockResolvedValue([makeAction()]);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(BASE_PATH), makeContext());
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(BASE_PATH), makeContext());
    expect(res.status).toBe(403);
  });

  it("lists pending actions without exposing organization UUID as primary data", async () => {
    const res = await GET(
      makeGet(`${BASE_PATH}?status=pending`),
      makeContext()
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].toolName).toBe("create_appointment");
    expect(body.data[0].lead.firstName).toBe("Ahmed");
    expect(body.data[0].summary.location).toBe("West Bay");
    expect(body.data[0]).not.toHaveProperty("organization_id");
    expect(body.data[0]).not.toHaveProperty("requested_by_user_id");
    expect(body.data[0]).not.toHaveProperty("result_resource_id");
    expect(body.meta).toEqual({ page: 1, limit: 20, count: 1 });
    expect(listAiToolActions).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { status: "pending", leadId: undefined }
    );
  });

  it("scopes by lead_id when provided", async () => {
    await GET(makeGet(`${BASE_PATH}?status=pending&lead_id=${LEAD_1}`), makeContext());
    expect(listAiToolActions).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { status: "pending", leadId: LEAD_1 }
    );
  });

  it("returns 422 for invalid pagination", async () => {
    const res = await GET(makeGet(`${BASE_PATH}?page=0`), makeContext());
    expect(res.status).toBe(422);
    expect(listAiToolActions).not.toHaveBeenCalled();
  });
});
