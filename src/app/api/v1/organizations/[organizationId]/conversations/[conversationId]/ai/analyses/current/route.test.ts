/**
 * GET /conversations/:conversationId/ai/analyses/current
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { AuthenticationError, NotFoundError, TenantAccessError } from "@/lib/errors";
import type { User } from "@supabase/auth-js";
import type { OrganizationMember } from "@/lib/db/types";

vi.mock("@/lib/api/auth", () => ({
  getAuthContext: vi.fn(),
  getOrgContext: vi.fn(),
}));

vi.mock("@/modules/ai/analysis/queries", () => ({
  getLatestAiSalesAnalysis: vi.fn(),
  getLatestInboundMessageId: vi.fn(),
  listAiSalesAnalyses: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getLatestAiSalesAnalysis,
  getLatestInboundMessageId,
} from "@/modules/ai/analysis/queries";
import { GET } from "./route";
import {
  AI_SALES_ANALYSIS_PROMPT_VERSION,
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import type { AiSalesAnalysis } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";

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

const row: AiSalesAnalysis = {
  id: "ana-1",
  organization_id: ORG_A,
  conversation_id: CONV_1,
  lead_id: "11111111-1111-4111-8111-111111111111",
  inbound_message_id: INBOUND,
  inbound_message_created_at: "2026-08-21T10:00:00Z",
  schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
  prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
  provider_name: "mock",
  status: "recorded",
  payload: {
    inboundIntent: "pricing",
    objection: "none",
    urgency: "low",
    qualification: "unknown",
    inferredStage: "exploring",
    buyingSignals: [],
    missingInformation: [],
    nextBestAction: "wait_for_customer",
    rationale: "Price question.",
    confidence: 0.3,
  },
  pipeline_snapshot: {
    leadStatus: "new",
    conversationStatus: "open",
    requiresHuman: false,
    aiPaused: false,
    latestMessageDirection: "inbound",
    lastInboundAt: "2026-08-21T10:00:00Z",
    lastOutboundAt: null,
    hasScheduledAppointment: false,
    hasPendingAppointmentApproval: false,
    hasPendingFollowUp: false,
    contactEmailPresent: false,
    contactPhonePresent: false,
  },
  error_code: null,
  requested_by_user_id: USER_1,
  trigger_source: "operator",
  channel_identity_id: null,
  created_at: "2026-08-21T10:01:00Z",
  updated_at: "2026-08-21T10:01:00Z",
};

describe("GET /conversations/:id/ai/analyses/current", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(getLatestAiSalesAnalysis).mockResolvedValue(row);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new AuthenticationError());
    const res = await GET(
      new NextRequest("http://localhost/api/current"),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-members", async () => {
    vi.mocked(getOrgContext).mockRejectedValue(new TenantAccessError());
    const res = await GET(
      new NextRequest("http://localhost/api/current"),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when no analysis exists", async () => {
    vi.mocked(getLatestAiSalesAnalysis).mockRejectedValue(new NotFoundError("Analysis"));
    const res = await GET(
      new NextRequest("http://localhost/api/current"),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns isCurrent false when a later inbound exists", async () => {
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(LATER);
    const res = await GET(
      new NextRequest("http://localhost/api/current"),
      { params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }) }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.isCurrent).toBe(false);
    expect(body.data.schemaVersion).toBe(AI_SALES_ANALYSIS_SCHEMA_VERSION);
  });
});
