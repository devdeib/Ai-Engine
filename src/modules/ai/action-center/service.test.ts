import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";
import type { AiToolActionWithLead } from "@/lib/db/types";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { PublicExecutionPlan } from "@/modules/ai/execution/plan";
import type { RecommendationPlanContext } from "@/modules/ai/execution/plan-context";
import type { AiSalesRecommendationWithLead } from "@/modules/ai/action-center/types";
import { actionCenterConversationHref } from "@/modules/ai/action-center/constants";

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/ai/actions/queries", () => ({
  listAiToolActions: vi.fn(),
}));
vi.mock("@/modules/ai/analysis/queries", () => ({
  getLatestInboundMessageId: vi.fn(),
}));
vi.mock("@/modules/ai/execution/plan-context", () => ({
  loadRecommendationPlanContext: vi.fn(),
  planForRecommendation: vi.fn(),
}));
vi.mock("@/modules/ai/action-center/queries", () => ({
  listRecentActionableRecommendations: vi.fn(),
}));
vi.mock("@/modules/ai/actions/write", () => ({
  executeCreateFollowUp: vi.fn(),
  requestCreateAppointment: vi.fn(),
  approveAiToolAction: vi.fn(),
}));
vi.mock("@/modules/ai/handoff", () => ({
  escalateToHuman: vi.fn(),
  pauseAI: vi.fn(),
  resumeAI: vi.fn(),
}));
vi.mock("@/modules/ai/execution/execute", () => ({
  executeFromRecommendation: vi.fn(),
}));

import { requireOrgMembership } from "@/modules/organizations/queries";
import { listAiToolActions } from "@/modules/ai/actions/queries";
import { getLatestInboundMessageId } from "@/modules/ai/analysis/queries";
import {
  loadRecommendationPlanContext,
  planForRecommendation,
} from "@/modules/ai/execution/plan-context";
import { listRecentActionableRecommendations } from "@/modules/ai/action-center/queries";
import { executeCreateFollowUp, approveAiToolAction } from "@/modules/ai/actions/write";
import { escalateToHuman, resumeAI } from "@/modules/ai/handoff";
import { executeFromRecommendation } from "@/modules/ai/execution/execute";
import { getAiActionCenter } from "@/modules/ai/action-center/service";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const USER_B = "00000000-0000-4000-8000-000000000099";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const CONV_3 = "cccccccc-0000-4000-8000-000000000003";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function pendingAction(
  overrides: Partial<AiToolActionWithLead> = {}
): AiToolActionWithLead {
  return {
    id: ACTION_1,
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    tool_name: "create_appointment",
    trust: "human_approval",
    status: "pending",
    input_hash: "a".repeat(64),
    payload: {
      startsAt: "2026-08-22T10:00:00.000Z",
      secret: "do-not-leak",
    },
    result_summary: {
      status: "pending_approval",
      startsAt: "2026-08-22T10:00:00.000Z",
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
    expires_at: "2026-12-31T10:00:00.000Z",
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

function rec(
  overrides: Partial<AiSalesRecommendationWithLead> = {}
): AiSalesRecommendationWithLead {
  return {
    id: "rec-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    inbound_message_created_at: "2026-08-21T10:00:00Z",
    analysis_id: "ana-1",
    policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
    status: "recorded",
    recommended_action: "suggest_appointment_approval",
    cited_analysis_action: "request_appointment",
    requires_human_approval: true,
    mapped_tool_name: "create_appointment",
    reason_codes: ["cited_model_action"],
    pipeline_snapshot: { rationale: "Customer wants a viewing" },
    error_code: null,
    requested_by_user_id: USER_1,
    trigger_source: "operator",
    channel_identity_id: null,
    created_at: "2026-08-21T10:01:00Z",
    updated_at: "2026-08-21T10:01:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function plan(
  overrides: Partial<PublicExecutionPlan> = {}
): PublicExecutionPlan {
  return {
    kind: "blocked_missing_schedule",
    executable: false,
    observability: "not_on_ledger",
    skipReason: "blocked_missing_schedule",
    ledger: null,
    ...overrides,
  };
}

function planContext(
  latestInboundId: string | null = INBOUND
): RecommendationPlanContext {
  return {
    organizationId: ORG_A,
    conversationId: CONV_1,
    leadId: LEAD_1,
    latestInboundId,
    conversation: null,
    lead: null,
    liveSnapshot: null,
    analysisPayload: null,
    actionsByInbound: new Map(),
    contextSkipReason: null,
  };
}

describe("getAiActionCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(listAiToolActions).mockResolvedValue([]);
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([]);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(loadRecommendationPlanContext).mockResolvedValue(planContext());
    vi.mocked(planForRecommendation).mockReturnValue(plan());
  });

  it("rejects unauthorized organization access before listing work", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(getAiActionCenter(ORG_A, USER_1)).rejects.toThrow(
      TenantAccessError
    );
    expect(listAiToolActions).not.toHaveBeenCalled();
    expect(listRecentActionableRecommendations).not.toHaveBeenCalled();
  });

  it("returns pending appointment HITL without raw payload or identities", async () => {
    vi.mocked(listAiToolActions).mockResolvedValue([pendingAction()]);

    const result = await getAiActionCenter(ORG_A, USER_1);

    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0]?.toolName).toBe("create_appointment");
    expect(result.pendingActions[0]?.status).toBe("pending");
    expect(result.pendingActions[0]?.lead?.firstName).toBe("Ahmed");
    expect(result.pendingActions[0]).not.toHaveProperty("payload");
    expect(result.pendingActions[0]).not.toHaveProperty("organization_id");
    expect(result.pendingActions[0]).not.toHaveProperty("requested_by_user_id");
    expect(JSON.stringify(result)).not.toContain("do-not-leak");
    expect(result.counts.pendingAppointments).toBe(1);
    expect(result.counts.total).toBe(1);
  });

  it("includes a current appointment recommendation with blocked_missing_schedule", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([rec()]);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(planForRecommendation).mockReturnValue(plan());

    const result = await getAiActionCenter(ORG_A, USER_1);

    expect(result.recommendationItems).toHaveLength(1);
    expect(result.recommendationItems[0]).toMatchObject({
      kind: "appointment_needs_scheduling",
      recommendedAction: "suggest_appointment_approval",
      planKind: "blocked_missing_schedule",
      executable: false,
      href: actionCenterConversationHref(CONV_1),
    });
    expect(result.counts.appointmentRecommendations).toBe(1);
  });

  it("includes a current handoff recommendation with blocked_no_auto_escalation", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([
      rec({
        id: "rec-handoff",
        conversation_id: CONV_2,
        recommended_action: "suggest_human_handoff",
        mapped_tool_name: null,
      }),
    ]);
    vi.mocked(loadRecommendationPlanContext).mockResolvedValue(
      planContext(INBOUND)
    );
    vi.mocked(planForRecommendation).mockReturnValue(
      plan({
        kind: "blocked_no_auto_escalation",
        skipReason: "blocked_no_auto_escalation",
      })
    );

    const result = await getAiActionCenter(ORG_A, USER_1);

    expect(result.recommendationItems[0]).toMatchObject({
      kind: "human_handoff_recommended",
      recommendedAction: "suggest_human_handoff",
      planKind: "blocked_no_auto_escalation",
      href: actionCenterConversationHref(CONV_2),
    });
    expect(result.counts.handoffRecommendations).toBe(1);
  });

  it("does not treat a stale recommendation as active work", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([
      rec({ inbound_message_id: INBOUND }),
    ]);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(LATER);

    const result = await getAiActionCenter(ORG_A, USER_1);

    expect(result.recommendationItems).toEqual([]);
    expect(loadRecommendationPlanContext).not.toHaveBeenCalled();
    expect(planForRecommendation).not.toHaveBeenCalled();
  });

  it("does not include informational or no-op recommendations as actionable", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([
      rec({ recommended_action: "wait_for_customer" }),
      rec({
        id: "rec-noop",
        conversation_id: CONV_2,
        recommended_action: "ask_qualification_question",
      }),
    ]);

    const result = await getAiActionCenter(ORG_A, USER_1);

    expect(result.recommendationItems).toEqual([]);
    expect(planForRecommendation).not.toHaveBeenCalled();
  });

  it("drops live plans that are not the operator-action kinds", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([rec()]);
    vi.mocked(planForRecommendation).mockReturnValue(
      plan({ kind: "no_op", skipReason: null })
    );

    const result = await getAiActionCenter(ORG_A, USER_1);
    expect(result.recommendationItems).toEqual([]);
  });

  it("does not represent expired HITL as pending", async () => {
    vi.mocked(listAiToolActions).mockResolvedValue([
      pendingAction({
        status: "pending",
        expires_at: "2020-01-01T00:00:00.000Z",
      }),
    ]);

    const result = await getAiActionCenter(ORG_A, USER_1);
    expect(result.pendingActions).toEqual([]);
    expect(result.counts.pendingAppointments).toBe(0);
  });

  it("does not represent rejected HITL as pending", async () => {
    vi.mocked(listAiToolActions).mockResolvedValue([
      pendingAction({ status: "rejected" }),
    ]);

    const result = await getAiActionCenter(ORG_A, USER_1);
    expect(result.pendingActions).toEqual([]);
  });

  it("does not return cross-tenant recommendation rows", async () => {
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([
      rec({ organization_id: ORG_B, requested_by_user_id: USER_B }),
    ]);

    const result = await getAiActionCenter(ORG_A, USER_1);
    expect(result.recommendationItems).toEqual([]);
    expect(loadRecommendationPlanContext).not.toHaveBeenCalled();
  });

  it("does not leak message bodies, emails, phones, or tenant user identity", async () => {
    vi.mocked(listAiToolActions).mockResolvedValue([pendingAction()]);
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([rec()]);

    const result = await getAiActionCenter(ORG_A, USER_1);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("Customer wants a viewing");
    expect(serialized).not.toContain("do-not-leak");
    expect(serialized).not.toContain(USER_1);
    expect(serialized).not.toContain(ORG_A);
    expect(serialized).not.toContain("requested_by_user_id");
    expect(serialized).not.toMatch(/"email"/);
    expect(serialized).not.toMatch(/"phone"/);
    expect(serialized).not.toContain("Hello, can we visit");
    expect(result.recommendationItems[0]).not.toHaveProperty("pipeline");
    expect(result.pendingActions[0]).not.toHaveProperty("payload");
  });

  it("bounds recommendation items to the requested limit", async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      rec({
        id: `rec-${index}`,
        conversation_id: `cccccccc-0000-4000-8000-00000000000${index + 1}`,
      })
    );
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue(rows);
    vi.mocked(getLatestInboundMessageId).mockResolvedValue(INBOUND);
    vi.mocked(loadRecommendationPlanContext).mockImplementation(
      async (_org, _user, conversationId) => ({
        ...planContext(),
        conversationId,
      })
    );

    const result = await getAiActionCenter(ORG_A, USER_1, {
      page: 1,
      limit: 2,
    });

    expect(listRecentActionableRecommendations).toHaveBeenCalledWith(
      ORG_A,
      USER_1,
      2
    );
    expect(result.recommendationItems).toHaveLength(2);
    expect(loadRecommendationPlanContext).toHaveBeenCalledTimes(2);
  });

  it("does not call execution, approval, handoff, or resume paths", async () => {
    vi.mocked(listAiToolActions).mockResolvedValue([pendingAction()]);
    vi.mocked(listRecentActionableRecommendations).mockResolvedValue([
      rec(),
      rec({
        id: "rec-handoff",
        conversation_id: CONV_3,
        recommended_action: "suggest_human_handoff",
      }),
    ]);
    vi.mocked(planForRecommendation).mockImplementation((row) =>
      row.recommended_action === "suggest_human_handoff"
        ? plan({
            kind: "blocked_no_auto_escalation",
            skipReason: "blocked_no_auto_escalation",
          })
        : plan()
    );

    await getAiActionCenter(ORG_A, USER_1);

    expect(executeCreateFollowUp).not.toHaveBeenCalled();
    expect(approveAiToolAction).not.toHaveBeenCalled();
    expect(escalateToHuman).not.toHaveBeenCalled();
    expect(resumeAI).not.toHaveBeenCalled();
    expect(executeFromRecommendation).not.toHaveBeenCalled();
  });
});
