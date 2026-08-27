/**
 * Phase 4.9 planner tests. Pure — no database, no CRM writes.
 */
import { describe, it, expect } from "vitest";
import type { AiSalesRecommendation, ConversationStatus } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import {
  planFromRecommendation,
  selectPlanLedgerRow,
  type PlanFromRecommendationInput,
  type PlanLedgerSource,
} from "@/modules/ai/execution/plan";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";
const INBOUND_AT = "2026-08-21T10:00:00Z";
const NOW = new Date("2026-08-22T12:00:00Z");

const pipeline: AiPipelineSnapshot = {
  leadStatus: "new",
  conversationStatus: "open",
  requiresHuman: false,
  aiPaused: false,
  latestMessageDirection: "inbound",
  lastInboundAt: INBOUND_AT,
  lastOutboundAt: null,
  hasScheduledAppointment: false,
  hasPendingFollowUp: false,
  hasPendingAppointmentApproval: false,
  contactEmailPresent: false,
  contactPhonePresent: false,
};

function analysis(
  nextBestAction: AiSalesAnalysisPayload["nextBestAction"],
  overrides: Partial<AiSalesAnalysisPayload> = {}
): AiSalesAnalysisPayload {
  return {
    inboundIntent: "general_question",
    objection: "none",
    urgency: "medium",
    qualification: "qualifying",
    inferredStage: "qualifying",
    buyingSignals: ["mentioning_timeline"],
    missingInformation: [],
    nextBestAction,
    rationale: "Customer asked for a callback later.",
    confidence: 0.8,
    ...overrides,
  };
}

function recommendation(
  overrides: Partial<AiSalesRecommendation> = {}
): AiSalesRecommendation {
  return {
    id: "rec-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    inbound_message_created_at: INBOUND_AT,
    analysis_id: "ana-1",
    policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
    status: "recorded",
    recommended_action: "suggest_follow_up",
    cited_analysis_action: "create_follow_up",
    requires_human_approval: false,
    mapped_tool_name: "create_follow_up",
    reason_codes: ["cited_model_action"],
    pipeline_snapshot: { stale: true },
    error_code: null,
    requested_by_user_id: USER_1,
    trigger_source: "operator",
    channel_identity_id: null,
    created_at: "2026-08-21T10:01:00Z",
    updated_at: "2026-08-21T10:01:00Z",
    ...overrides,
  };
}

function ledger(
  overrides: Partial<PlanLedgerSource> = {}
): PlanLedgerSource {
  return {
    id: "action-1",
    tool_name: "create_follow_up",
    status: "pending",
    trust: "autonomous",
    expires_at: null,
    created_at: "2026-08-21T10:02:00Z",
    inbound_message_id: INBOUND,
    ...overrides,
  };
}

const conversation = {
  organizationId: ORG_A,
  conversationId: CONV_1,
  leadId: LEAD_1,
  status: "open" as ConversationStatus,
  requiresHuman: false,
  aiPausedAt: null as string | null,
};

const lead = {
  organizationId: ORG_A,
  leadId: LEAD_1,
};

function input(
  overrides: Partial<PlanFromRecommendationInput> = {}
): PlanFromRecommendationInput {
  return {
    recommendation: recommendation(),
    organizationId: ORG_A,
    conversationId: CONV_1,
    leadId: LEAD_1,
    latestInboundId: INBOUND,
    conversation,
    lead,
    liveSnapshot: pipeline,
    analysisPayload: analysis("create_follow_up"),
    inboundActions: [],
    now: NOW,
    ...overrides,
  };
}

describe("planFromRecommendation", () => {
  it("marks suggest_follow_up executable when 4.8 guards would allow it", () => {
    const plan = planFromRecommendation(input());
    expect(plan).toEqual({
      kind: "executable_follow_up",
      executable: true,
      observability: "not_on_ledger",
      skipReason: null,
      ledger: null,
    });
  });

  it("does not call absence of a ledger row not_executed", () => {
    const plan = planFromRecommendation(input());
    expect(JSON.stringify(plan)).not.toContain("not_executed");
    expect(plan.observability).toBe("not_on_ledger");
  });

  it("does not trust the persisted pipeline snapshot as live state", () => {
    const plan = planFromRecommendation(
      input({
        liveSnapshot: { ...pipeline, hasPendingFollowUp: true },
        recommendation: recommendation({
          pipeline_snapshot: { hasPendingFollowUp: false },
        }),
      })
    );
    expect(plan.kind).toBe("blocked");
    expect(plan.skipReason).toBe("already_has_pending_follow_up");
    expect(plan.executable).toBe(false);
  });

  it("reports already_executed when the follow-up ledger is executed", () => {
    const plan = planFromRecommendation(
      input({
        inboundActions: [ledger({ status: "executed" })],
      })
    );
    expect(plan.kind).toBe("already_executed");
    expect(plan.executable).toBe(false);
    expect(plan.observability).toBe("on_ledger");
    expect(plan.ledger).toEqual({
      actionId: "action-1",
      toolName: "create_follow_up",
      status: "executed",
      trust: "autonomous",
    });
  });

  it("exposes pending follow-up ledger without claiming already_executed", () => {
    const plan = planFromRecommendation(
      input({ inboundActions: [ledger({ status: "pending" })] })
    );
    expect(plan.kind).toBe("blocked");
    expect(plan.skipReason).toBe("already_has_tool_action");
    expect(plan.ledger?.status).toBe("pending");
    expect(plan.executable).toBe(false);
  });

  it("exposes executing follow-up ledger", () => {
    const plan = planFromRecommendation(
      input({ inboundActions: [ledger({ status: "executing" })] })
    );
    expect(plan.skipReason).toBe("already_has_tool_action");
    expect(plan.ledger?.status).toBe("executing");
    expect(plan.kind).toBe("blocked");
  });

  it("keeps failed follow-up observable while remaining executable", () => {
    const plan = planFromRecommendation(
      input({ inboundActions: [ledger({ status: "failed" })] })
    );
    expect(plan.kind).toBe("executable_follow_up");
    expect(plan.executable).toBe(true);
    expect(plan.observability).toBe("on_ledger");
    expect(plan.ledger?.status).toBe("failed");
  });

  it("exposes rejected follow-up without treating it as a 4.8 skip", () => {
    const plan = planFromRecommendation(
      input({ inboundActions: [ledger({ status: "rejected" })] })
    );
    expect(plan.kind).toBe("executable_follow_up");
    expect(plan.ledger?.status).toBe("rejected");
  });

  it("exposes expired pending as effective expired while still blocking like 4.8", () => {
    const plan = planFromRecommendation(
      input({
        inboundActions: [
          ledger({
            status: "pending",
            expires_at: "2026-08-21T00:00:00Z",
          }),
        ],
      })
    );
    expect(plan.kind).toBe("blocked");
    expect(plan.skipReason).toBe("already_has_tool_action");
    expect(plan.ledger?.status).toBe("expired");
  });

  it("blocks appointment recommendations without inventing a schedule", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "suggest_appointment_approval",
          cited_analysis_action: "request_appointment_approval",
          mapped_tool_name: "create_appointment",
          requires_human_approval: true,
        }),
        analysisPayload: analysis("request_appointment_approval"),
      })
    );
    expect(plan.kind).toBe("blocked_missing_schedule");
    expect(plan.skipReason).toBe("blocked_missing_schedule");
    expect(plan.executable).toBe(false);
  });

  it("still exposes a model-originated appointment ledger on a blocked schedule", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "suggest_appointment_approval",
          cited_analysis_action: "request_appointment_approval",
          mapped_tool_name: "create_appointment",
          requires_human_approval: true,
        }),
        analysisPayload: analysis("request_appointment_approval"),
        inboundActions: [
          ledger({
            id: "hitl-1",
            tool_name: "create_appointment",
            trust: "human_approval",
            status: "pending",
            expires_at: "2026-08-23T00:00:00Z",
          }),
        ],
      })
    );
    expect(plan.kind).toBe("blocked_missing_schedule");
    expect(plan.ledger).toMatchObject({
      actionId: "hitl-1",
      toolName: "create_appointment",
      status: "pending",
      trust: "human_approval",
    });
  });

  it("blocks human handoff without escalating", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "suggest_human_handoff",
          cited_analysis_action: "human_handoff",
          mapped_tool_name: null,
        }),
        analysisPayload: analysis("human_handoff"),
      })
    );
    expect(plan.kind).toBe("blocked_no_auto_escalation");
    expect(plan.executable).toBe(false);
  });

  it.each([
    ["ask_qualification_question", "ask_qualification_question"],
    ["provide_information", "provide_information"],
    ["wait_for_customer", "wait_for_customer"],
  ] as const)("treats %s as no_op", (action, cited) => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: action,
          cited_analysis_action: cited,
          mapped_tool_name: null,
        }),
        analysisPayload: analysis(cited),
      })
    );
    expect(plan.kind).toBe("no_op");
    expect(plan.executable).toBe(false);
    expect(plan.skipReason).toBeNull();
  });

  it("treats defer_existing_control as blocked when live state still requires a human", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "defer_existing_control",
          cited_analysis_action: null,
          mapped_tool_name: null,
          reason_codes: ["requires_human"],
        }),
        conversation: { ...conversation, requiresHuman: true },
        liveSnapshot: { ...pipeline, requiresHuman: true },
        analysisPayload: analysis("create_follow_up"),
      })
    );
    expect(plan.kind).toBe("blocked");
    expect(plan.skipReason).toBe("requires_human");
  });

  it("treats matching defer_existing_control as no_op after conversation guards pass", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "defer_existing_control",
          cited_analysis_action: null,
          mapped_tool_name: null,
          reason_codes: ["requires_human"],
        }),
        liveSnapshot: { ...pipeline, requiresHuman: true },
      })
    );
    expect(plan.kind).toBe("no_op");
    expect(plan.executable).toBe(false);
  });

  it("treats wait_for_customer as no_op when analysis is unavailable", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          recommended_action: "wait_for_customer",
          cited_analysis_action: null,
          mapped_tool_name: null,
          reason_codes: ["analysis_unavailable"],
        }),
        analysisPayload: null,
      })
    );
    expect(plan.kind).toBe("no_op");
  });

  it("blocks a closed conversation", () => {
    const plan = planFromRecommendation(
      input({ conversation: { ...conversation, status: "closed" } })
    );
    expect(plan).toMatchObject({
      kind: "blocked",
      skipReason: "closed",
      executable: false,
    });
  });

  it("blocks a paused conversation", () => {
    const plan = planFromRecommendation(
      input({
        conversation: { ...conversation, aiPausedAt: "2026-08-21T10:05:00Z" },
      })
    );
    expect(plan.skipReason).toBe("conversation_paused");
    expect(plan.kind).toBe("blocked");
  });

  it("blocks when the conversation requires a human", () => {
    const plan = planFromRecommendation(
      input({ conversation: { ...conversation, requiresHuman: true } })
    );
    expect(plan.skipReason).toBe("requires_human");
  });

  it("blocks a failed recommendation", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          status: "failed",
          error_code: "AI_RECOMMENDATION_FAILED",
        }),
      })
    );
    expect(plan.skipReason).toBe("failed_recommendation");
    expect(plan.kind).toBe("blocked");
  });

  it("blocks an unsupported policy version", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          policy_version: "AI_SALES_RECOMMENDATION_POLICY_V0",
        }),
      })
    );
    expect(plan.skipReason).toBe("unsupported_policy");
  });

  it("blocks when live policy no longer matches the persisted recommendation", () => {
    const plan = planFromRecommendation(
      input({ analysisPayload: analysis("provide_information") })
    );
    expect(plan.kind).toBe("blocked");
    expect(plan.skipReason).toBe("policy_mismatch");
    expect(plan.executable).toBe(false);
  });

  it("does not mark a stale recommendation executable", () => {
    const plan = planFromRecommendation(input({ latestInboundId: LATER }));
    expect(plan.kind).toBe("blocked");
    expect(plan.executable).toBe(false);
    expect(plan.observability).toBe("not_on_ledger");
  });

  it("still reports already_executed for a stale recommendation with an executed ledger", () => {
    const plan = planFromRecommendation(
      input({
        latestInboundId: LATER,
        inboundActions: [ledger({ status: "executed" })],
      })
    );
    expect(plan.kind).toBe("already_executed");
  });

  it("blocks identity mismatch", () => {
    const plan = planFromRecommendation(
      input({
        recommendation: recommendation({
          lead_id: "99999999-9999-4999-8999-999999999999",
        }),
      })
    );
    expect(plan.skipReason).toBe("identity_mismatch");
  });

  it("uses a loader skip reason when live context cannot be established", () => {
    const plan = planFromRecommendation(
      input({
        contextSkipReason: "tenant_mismatch",
        conversation: null,
        lead: null,
        liveSnapshot: null,
      })
    );
    expect(plan.skipReason).toBe("tenant_mismatch");
    expect(plan.kind).toBe("blocked");
  });

  it("never upgrades failed ledger status to executed", () => {
    const plan = planFromRecommendation(
      input({ inboundActions: [ledger({ status: "failed" })] })
    );
    expect(plan.ledger?.status).toBe("failed");
  });

  it("contains no secrets, emails, phones, or message bodies", () => {
    const plan = planFromRecommendation(input());
    const raw = JSON.stringify(plan);
    expect(raw).not.toContain(ORG_A);
    expect(raw).not.toContain(USER_1);
    expect(raw).not.toContain("ahmed@example.com");
    expect(raw).not.toContain("+974");
    expect(raw).not.toContain("Customer asked for a callback later.");
    expect(raw).not.toContain("AI_RECOMMENDATION_FAILED");
  });
});

describe("selectPlanLedgerRow", () => {
  it("prefers create_follow_up for follow-up plans", () => {
    const selected = selectPlanLedgerRow(
      [
        ledger({
          id: "appt",
          tool_name: "create_appointment",
          created_at: "2026-08-21T10:03:00Z",
        }),
        ledger({
          id: "fu",
          tool_name: "create_follow_up",
          created_at: "2026-08-21T10:01:00Z",
        }),
      ],
      "create_follow_up"
    );
    expect(selected?.id).toBe("fu");
  });

  it("prefers create_appointment for appointment visibility", () => {
    const selected = selectPlanLedgerRow(
      [
        ledger({
          id: "fu",
          tool_name: "create_follow_up",
          created_at: "2026-08-21T10:03:00Z",
        }),
        ledger({
          id: "appt",
          tool_name: "create_appointment",
          created_at: "2026-08-21T10:01:00Z",
        }),
      ],
      "create_appointment"
    );
    expect(selected?.id).toBe("appt");
  });

  it("picks the newest row of the same tool", () => {
    const selected = selectPlanLedgerRow(
      [
        ledger({ id: "old", created_at: "2026-08-21T10:01:00Z" }),
        ledger({ id: "new", created_at: "2026-08-21T10:05:00Z" }),
      ],
      "create_follow_up"
    );
    expect(selected?.id).toBe("new");
  });

  it("falls back to the other tool when the preferred tool is absent", () => {
    const selected = selectPlanLedgerRow(
      [
        ledger({
          id: "appt",
          tool_name: "create_appointment",
        }),
      ],
      "create_follow_up"
    );
    expect(selected?.id).toBe("appt");
  });
});
