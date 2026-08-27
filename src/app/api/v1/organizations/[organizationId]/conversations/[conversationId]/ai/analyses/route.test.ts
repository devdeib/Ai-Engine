/**
 * GET /conversations/:conversationId/ai/analyses
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
  listAiSalesAnalyses: vi.fn(),
  getLatestInboundMessageId: vi.fn(),
  getLatestAiSalesAnalysis: vi.fn(),
}));

import { getOrgContext } from "@/lib/api/auth";
import {
  getLatestInboundMessageId,
  listAiSalesAnalyses,
} from "@/modules/ai/analysis/queries";
import { GET } from "./route";
import {
  AI_SALES_ANALYSIS_PROMPT_VERSION,
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import type { AiSalesAnalysis } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
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
    hasPendingFollowUp: false,
    hasPendingAppointmentApproval: false,
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

function makeGet(query = "") {
  return new NextRequest(
    `http://localhost:3000/api/v1/organizations/${ORG_A}/conversations/${CONV_1}/ai/analyses${query}`
  );
}

describe("GET /conversations/:id/ai/analyses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrgContext).mockResolvedValue({
      user: mockUser,
      member: mockMember,
      organizationId: ORG_A,
    });
    vi.mocked(listAiSalesAnalyses).mockResolvedValue([row]);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
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
    vi.mocked(listAiSalesAnalyses).mockRejectedValue(new NotFoundError("Conversation"));
    const res = await GET(makeGet(), {
      params: Promise.resolve({ organizationId: ORG_B, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(404);
  });

  it("lists analyses with pagination newest-first and omits secrets", async () => {
    const res = await GET(makeGet("?page=1&limit=20"), {
      params: Promise.resolve({ organizationId: ORG_A, conversationId: CONV_1 }),
    });
    expect(res.status).toBe(200);
    expect(listAiSalesAnalyses).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      CONV_1,
      { page: 1, limit: 20 }
    );
    const body = await res.json();
    expect(body.meta).toEqual({ page: 1, limit: 20, count: 1 });
    expect(body.data[0].analysis.inboundIntent).toBe("pricing");
    expect(JSON.stringify(body)).not.toContain(ORG_A);
    expect(JSON.stringify(body)).not.toContain(USER_1);
    expect(JSON.stringify(body)).not.toContain(INBOUND);
  });
});
