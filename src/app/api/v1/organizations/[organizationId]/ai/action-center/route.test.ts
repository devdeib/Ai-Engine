/**
 * GET /api/v1/organizations/:organizationId/ai/action-center
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember } from "@/lib/db/types";
import type { AiActionCenter } from "@/modules/ai/action-center/types";
import { actionCenterConversationHref } from "@/modules/ai/action-center/constants";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/action-center/service", () => ({
  getAiActionCenter: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import { getAiActionCenter } from "@/modules/ai/action-center/service";
import { GET } from "./route";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const BASE_PATH = `/api/v1/organizations/${ORG_A}/ai/action-center`;

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

const emptyCenter: AiActionCenter = {
  pendingActions: [],
  recommendationItems: [],
  counts: {
    pendingAppointments: 0,
    appointmentRecommendations: 0,
    handoffRecommendations: 0,
    total: 0,
  },
};

function makeGet(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

function makeContext(organizationId = ORG_A) {
  return { params: Promise.resolve({ organizationId }) };
}

describe("GET /ai/action-center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue(mockOrgContext);
    vi.mocked(getAiActionCenter).mockResolvedValue(emptyCenter);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(BASE_PATH), makeContext());
    expect(res.status).toBe(401);
    expect(getAiActionCenter).not.toHaveBeenCalled();
  });

  it("returns 403 when the user is not a member", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(BASE_PATH), makeContext());
    expect(res.status).toBe(403);
    expect(getAiActionCenter).not.toHaveBeenCalled();
  });

  it("returns 403 for organization mismatch when membership fails", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(
      makeGet(`/api/v1/organizations/${ORG_B}/ai/action-center`),
      makeContext(ORG_B)
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for an authenticated member", async () => {
    vi.mocked(getAiActionCenter).mockResolvedValue({
      ...emptyCenter,
      recommendationItems: [
        {
          id: "rec-1",
          kind: "appointment_needs_scheduling",
          conversationId: CONV_1,
          recommendedAction: "suggest_appointment_approval",
          planKind: "blocked_missing_schedule",
          executable: false,
          observability: "not_on_ledger",
          skipReason: "blocked_missing_schedule",
          ledger: null,
          createdAt: "2026-08-21T10:01:00Z",
          lead: { firstName: "Ahmed", lastName: "Ali", companyName: null },
          href: actionCenterConversationHref(CONV_1),
        },
      ],
      counts: {
        pendingAppointments: 0,
        appointmentRecommendations: 1,
        handoffRecommendations: 0,
        total: 1,
      },
    });

    const res = await GET(makeGet(BASE_PATH), makeContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recommendationItems[0].kind).toBe(
      "appointment_needs_scheduling"
    );
    expect(body.data.counts.total).toBe(1);
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      pendingCount: 0,
      recommendationCount: 1,
    });
    expect(getAiActionCenter).toHaveBeenCalledWith(ORG_A, USER_1, {
      page: 1,
      limit: 20,
    });
  });

  it("returns 422 for invalid pagination", async () => {
    const res = await GET(makeGet(`${BASE_PATH}?page=0`), makeContext());
    expect(res.status).toBe(422);
    expect(getAiActionCenter).not.toHaveBeenCalled();
  });
});
