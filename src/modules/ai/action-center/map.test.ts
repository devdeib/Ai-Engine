import { describe, it, expect } from "vitest";
import {
  actionCenterItemKind,
  isActionCenterActionableAction,
  toAiSalesRecommendationWithLead,
  toPublicActionCenterRecommendationItem,
} from "@/modules/ai/action-center/map";
import { actionCenterConversationHref } from "@/modules/ai/action-center/constants";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { PublicExecutionPlan } from "@/modules/ai/execution/plan";
import type { AiSalesRecommendationWithLead } from "@/modules/ai/action-center/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

function recommendation(
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
    pipeline_snapshot: { rationale: "secret analysis" },
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

const appointmentPlan: PublicExecutionPlan = {
  kind: "blocked_missing_schedule",
  executable: false,
  observability: "not_on_ledger",
  skipReason: "blocked_missing_schedule",
  ledger: null,
};

describe("action-center map", () => {
  it("maps only public navigation fields and omits payloads, messages, and identities", () => {
    const dto = toPublicActionCenterRecommendationItem(
      recommendation(),
      appointmentPlan,
      "appointment_needs_scheduling"
    );

    expect(dto).toEqual({
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
    });

    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain("secret analysis");
    expect(serialized).not.toContain("pipeline_snapshot");
    expect(serialized).not.toContain(USER_1);
    expect(serialized).not.toContain(ORG_A);
    expect(serialized).not.toContain("requested_by_user_id");
    expect(serialized).not.toContain("inbound_message_id");
    expect(dto).not.toHaveProperty("payload");
    expect(dto).not.toHaveProperty("pipeline");
    expect(dto).not.toHaveProperty("organizationId");
  });

  it("classifies live plan kinds and ignores informational recommendations", () => {
    expect(
      actionCenterItemKind(
        "suggest_appointment_approval",
        "blocked_missing_schedule"
      )
    ).toBe("appointment_needs_scheduling");
    expect(
      actionCenterItemKind(
        "suggest_human_handoff",
        "blocked_no_auto_escalation"
      )
    ).toBe("human_handoff_recommended");
    expect(actionCenterItemKind("suggest_appointment_approval", "no_op")).toBe(
      null
    );
    expect(
      actionCenterItemKind("suggest_human_handoff", "executable_follow_up")
    ).toBe(null);
    expect(isActionCenterActionableAction("wait_for_customer")).toBe(false);
    expect(isActionCenterActionableAction("ask_qualification_question")).toBe(
      false
    );
    expect(isActionCenterActionableAction("no_op")).toBe(false);
  });

  it("extracts lead display fields without email or phone", () => {
    const mapped = toAiSalesRecommendationWithLead({
      id: "rec-1",
      organization_id: ORG_A,
      recommended_action: "suggest_human_handoff",
      lead: {
        id: LEAD_1,
        first_name: "Sara",
        last_name: "Nasser",
        company_name: "VG",
        email: "hidden@example.com",
        phone: "+974555",
      },
    });

    expect(mapped.lead).toEqual({
      id: LEAD_1,
      first_name: "Sara",
      last_name: "Nasser",
      company_name: "VG",
    });
    expect(mapped.lead).not.toHaveProperty("email");
    expect(mapped.lead).not.toHaveProperty("phone");
  });
});
