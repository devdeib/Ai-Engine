/**
 * GET /conversations/:conversationId/ai/recommendations/current
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, NotFoundError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { RecommendationPlanContext } from "@/modules/ai/execution/plan-context";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/recommendation/queries", () => ({
  getCurrentAiSalesRecommendation: vi.fn(),
  listAiSalesRecommendations: vi.fn(),
}));

vi.mock("@/modules/ai/execution/plan-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/ai/execution/plan-context")>();
  return {
    ...actual,
    loadRecommendationPlanContext: vi.fn(),
  };
});

import { getOrgContext } from "@/lib/api/auth";
import { getCurrentAiSalesRecommendation } from "@/modules/ai/recommendation/queries";
import { loadRecommendationPlanContext } from "@/modules/ai/execution/plan-context";
import { GET } from "./route";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendation } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

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

const pipeline: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: "2026-08-21T10:00:00Z",
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
};

const row: AiSalesRecommendation = {
  id: "rec-1",
  organization_id: ORG_A,
  conversation_id: CONV_1,
  lead_id: LEAD_1,
  inbound_message_id: INBOUND,
  inbound_message_created_at: "2026-08-21T10:00:00Z",
  analysis_id: null,
  policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
  status: "recorded",
  recommended_action: "wait_for_customer",
  cited_analysis_action: null,
  requires_human_approval: false,
  mapped_tool_name: null,
  reason_codes: ["analysis_unavailable"],
  pipeline_snapshot: { ...pipeline },
  error_code: null,
  requested_by_user_id: USER_1,
  trigger_source: "operator",
  channel_identity_id: null,
  created_at: "2026-08-21T10:01:00Z",
  updated_at: "2026-08-21T10:01:00Z",
};

const planContext: RecommendationPlanContext = {
  organizationId: ORG_A,
  conversationId: CONV_1,
  leadId: LEAD_1,
  latestInboundId: INBOUND,
  conversation: {
    organizationId: ORG_A,
    conversationId: CONV_1,
    leadId: LEAD_1,
    status: "open",
    requiresHuman: false,
    aiPausedAt: null,
  },
  lead: { organizationId: ORG_A, leadId: LEAD_1 },
  liveSnapshot: pipeline,
  analysisPayload: null,
  actionsByInbound: new Map(),
  contextSkipReason: null,
};

describe("GET /conversations/:id/ai/recommendations/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(getCurrentAiSalesRecommendation).mockResolvedValue(row);
    vi.mocked(loadRecommendationPlanContext).mockResolvedValue(planContext);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(new NextRequest("http://localhost/api/current"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(new NextRequest("http://localhost/api/current"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when no recommendation exists", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new NotFoundError("Recommendation")
    );
    const res = await GET(new NextRequest("http://localhost/api/current"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a missing conversation", async () => {
    vi.mocked(getCurrentAiSalesRecommendation).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    const res = await GET(new NextRequest("http://localhost/api/current"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the current recommendation DTO with an additive plan", async () => {
    const res = await GET(new NextRequest("http://localhost/api/current"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.isCurrent).toBe(true);
    expect(body.data.recommendedAction).toBe("wait_for_customer");
    expect(body.data.policyVersion).toBe(AI_SALES_RECOMMENDATION_POLICY_V1);
    expect(body.data.plan).toEqual({
      kind: "no_op",
      executable: false,
      observability: "not_on_ledger",
      skipReason: null,
      ledger: null,
    });
    expect(JSON.stringify(body)).not.toContain(ORG_A);
    expect(JSON.stringify(body)).not.toContain(USER_1);
  });
});
