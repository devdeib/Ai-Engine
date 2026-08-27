/**
 * GET /conversations/:conversationId/ai/recommendations
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
  listAiSalesRecommendations: vi.fn(),
  getCurrentAiSalesRecommendation: vi.fn(),
}));

vi.mock("@/modules/ai/execution/plan-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/ai/execution/plan-context")>();
  return {
    ...actual,
    loadRecommendationPlanContext: vi.fn(),
  };
});

import { getOrgContext } from "@/lib/api/auth";
import { listAiSalesRecommendations } from "@/modules/ai/recommendation/queries";
import { loadRecommendationPlanContext } from "@/modules/ai/execution/plan-context";
import { GET } from "./route";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendation } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const ANALYSIS = "aaaaaaaa-1111-4111-8111-111111111111";

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
  analysis_id: ANALYSIS,
  policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
  status: "recorded",
  recommended_action: "provide_information",
  cited_analysis_action: "provide_information",
  requires_human_approval: false,
  mapped_tool_name: null,
  reason_codes: ["cited_model_action"],
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
  analysisPayload: {
    inboundIntent: "general_question",
    objection: "none",
    urgency: "medium",
    qualification: "qualifying",
    inferredStage: "qualifying",
    buyingSignals: [],
    missingInformation: [],
    nextBestAction: "provide_information",
    rationale: "Share the brochure.",
    confidence: 0.8,
  },
  actionsByInbound: new Map(),
  contextSkipReason: null,
};

function makeGet(query = "") {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/recommendations${query}`
  );
}

describe("GET /conversations/:id/ai/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(listAiSalesRecommendations).mockResolvedValue([row]);
    vi.mocked(loadRecommendationPlanContext).mockResolvedValue(planContext);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for cross-tenant conversation lookup", async () => {
    vi.mocked(listAiSalesRecommendations).mockRejectedValue(
      new NotFoundError("Conversation")
    );
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_B, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(404);
  });

  it("lists recommendations with pagination, plan, and omits secrets", async () => {
    const res = await GET(makeGet("?page=1&limit=20"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(200);
    expect(listAiSalesRecommendations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      { page: 1, limit: 20 }
    );
    const body = await res.json();
    expect(body.meta).toEqual({ page: 1, limit: 20, count: 1 });
    expect(body.data[0].recommendedAction).toBe("provide_information");
    expect(body.data[0].plan).toEqual({
      kind: "no_op",
      executable: false,
      observability: "not_on_ledger",
      skipReason: null,
      ledger: null,
    });
    expect(body.data[0].id).toBe("rec-1");
    expect(body.data[0].isCurrent).toBe(true);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(ORG_A);
    expect(raw).not.toContain(USER_1);
    expect(raw).not.toContain(INBOUND);
    expect(raw).not.toContain(ANALYSIS);
    expect(raw).not.toContain("error_code");
    expect(raw).not.toContain("Share the brochure.");
  });
});
