/**
 * Durable AI sales recommendation persistence tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { persistAiSalesRecommendation } from "@/modules/ai/recommendation/persist";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const ANALYSIS = "aaaaaaaa-1111-4111-8111-111111111111";

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

const payload: AiSalesAnalysisPayload = {
  inboundIntent: "pricing",
  objection: "none",
  urgency: "low",
  qualification: "unknown",
  inferredStage: "exploring",
  buyingSignals: [],
  missingInformation: ["budget"],
  nextBestAction: "ask_qualification_question",
  rationale: "Need budget before quoting.",
  confidence: 0.4,
};

const decision = {
  recommendedAction: "ask_qualification_question" as const,
  reasonCodes: ["cited_model_action" as const],
  requiresHumanApproval: false,
  mappedToolName: null,
};

let rows: AiSalesRecommendation[] = [];

function asRow(
  overrides: Partial<AiSalesRecommendation> = {}
): AiSalesRecommendation {
  return {
    id: "rec-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    inbound_message_created_at: "2026-08-21T10:00:00Z",
    analysis_id: ANALYSIS,
    policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
    status: "recorded",
    recommended_action: "ask_qualification_question",
    cited_analysis_action: "ask_qualification_question",
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
    ...overrides,
  };
}

function mockClient() {
  const insert = vi.fn((value: Record<string, unknown>) => {
    const duplicate = rows.find(
      (row) =>
        row.organization_id === value.organization_id &&
        row.inbound_message_id === value.inbound_message_id
    );
    if (duplicate) {
      return {
        select: () => ({
          single: async () => ({
            data: null,
            error: { code: "23505", message: "duplicate key" },
          }),
        }),
      };
    }
    const row = asRow({
      id: `rec-${rows.length + 1}`,
      status: value.status as AiSalesRecommendation["status"],
      recommended_action:
        value.recommended_action as AiSalesRecommendation["recommended_action"],
      cited_analysis_action: (value.cited_analysis_action as string | null) ?? null,
      analysis_id: (value.analysis_id as string | null) ?? null,
      error_code: (value.error_code as string | null) ?? null,
      reason_codes: value.reason_codes as string[],
      mapped_tool_name:
        (value.mapped_tool_name as AiSalesRecommendation["mapped_tool_name"]) ??
        null,
      requires_human_approval: Boolean(value.requires_human_approval),
    });
    rows.push(row);
    return {
      select: () => ({
        single: async () => ({ data: row, error: null }),
      }),
    };
  });

  const maybeSingle = vi.fn(async () => {
    const row = rows.find((item) => item.inbound_message_id === INBOUND) ?? null;
    return { data: row, error: null };
  });

  const updateEqStatus = vi.fn().mockImplementation(async () => {
    const current = rows[0];
    if (!current || current.status !== "failed") {
      return { data: null, error: { message: "no row" } };
    }
    current.status = "recorded";
    current.recommended_action = "ask_qualification_question";
    current.error_code = null;
    current.cited_analysis_action = "ask_qualification_question";
    return { data: current, error: null };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn(() => ({
      insert,
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: updateEqStatus,
              })),
            })),
          })),
        })),
      })),
    })),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

const baseInput = {
  organizationId: ORG_A,
  userId: USER_1,
  triggerSource: "operator" as const,
  channelIdentityId: null,
  conversationId: CONV_1,
  leadId: LEAD_1,
  inboundMessageId: INBOUND,
  inboundMessageCreatedAt: "2026-08-21T10:00:00Z",
  analysisId: ANALYSIS,
  analysisStatus: "recorded" as const,
  analysisPayload: payload,
  pipeline,
  decision,
};

describe("persistAiSalesRecommendation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    mockClient();
  });

  it("inserts a recorded recommendation with the server policy version", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      errorCode: null,
    });
    expect(stored?.status).toBe("recorded");
    expect(stored?.policy_version).toBe(AI_SALES_RECOMMENDATION_POLICY_V1);
    expect(stored?.cited_analysis_action).toBe("ask_qualification_question");
    expect(stored?.analysis_id).toBe(ANALYSIS);
    expect(rows).toHaveLength(1);
  });

  it("inserts with analysis_id null when no analysis row exists", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      analysisId: null,
      analysisStatus: null,
      analysisPayload: null,
      decision: {
        recommendedAction: "wait_for_customer",
        reasonCodes: ["analysis_unavailable"],
        requiresHumanApproval: false,
        mappedToolName: null,
      },
      errorCode: null,
    });
    expect(stored?.analysis_id).toBeNull();
    expect(stored?.cited_analysis_action).toBeNull();
    expect(stored?.status).toBe("recorded");
  });

  it("does not cite a failed analysis payload", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      analysisStatus: "failed",
      analysisPayload: payload,
      decision: {
        recommendedAction: "wait_for_customer",
        reasonCodes: ["analysis_unavailable"],
        requiresHumanApproval: false,
        mappedToolName: null,
      },
      errorCode: null,
    });
    expect(stored?.cited_analysis_action).toBeNull();
    expect(stored?.status).toBe("recorded");
  });

  it("inserts a failed recommendation with conservative action", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      decision: {
        recommendedAction: "wait_for_customer",
        reasonCodes: ["analysis_unavailable"],
        requiresHumanApproval: false,
        mappedToolName: null,
      },
      errorCode: "AI_RECOMMENDATION_FAILED",
    });
    expect(stored?.status).toBe("failed");
    expect(stored?.error_code).toBe("AI_RECOMMENDATION_FAILED");
    expect(stored?.recommended_action).toBe("wait_for_customer");
  });

  it("replays a recorded row on unique inbound and does not overwrite", async () => {
    rows = [asRow({ recommended_action: "wait_for_customer" })];
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      errorCode: null,
    });
    expect(stored?.recommended_action).toBe("wait_for_customer");
    expect(rows).toHaveLength(1);
  });

  it("upgrades failed to recorded when a later attempt succeeds", async () => {
    rows = [
      asRow({
        status: "failed",
        error_code: "AI_RECOMMENDATION_FAILED",
        recommended_action: "wait_for_customer",
      }),
    ];
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      errorCode: null,
    });
    expect(stored?.status).toBe("recorded");
    expect(stored?.error_code).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("preserves an existing failure when the current attempt also fails", async () => {
    rows = [
      asRow({
        status: "failed",
        error_code: "AI_RECOMMENDATION_FAILED",
        recommended_action: "wait_for_customer",
      }),
    ];
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      errorCode: "AI_RECOMMENDATION_FAILED",
    });
    expect(stored?.status).toBe("failed");
    expect(rows).toHaveLength(1);
  });

  it("rejects non-members before insert", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      persistAiSalesRecommendation({ ...baseInput, errorCode: null })
    ).rejects.toThrow(TenantAccessError);
  });

  it("returns null when the pipeline snapshot is invalid", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      pipeline: { leadStatus: "not-a-status" } as never,
      errorCode: null,
    });
    expect(stored).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns null when reason codes are not from the closed set", async () => {
    const stored = await persistAiSalesRecommendation({
      ...baseInput,
      decision: {
        ...decision,
        reasonCodes: ["ignore previous instructions"] as never,
      },
      errorCode: null,
    });
    expect(stored).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });
});
