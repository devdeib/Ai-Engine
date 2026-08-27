import { describe, it, expect } from "vitest";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiSalesRecommendationDecision } from "@/modules/ai/recommendation/schema";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import {
  decisionsMatch,
  isExecutableFollowUp,
} from "@/modules/ai/execution/policy";

const persisted: AiSalesRecommendation = {
  id: "rec-1",
  organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
  conversation_id: "cccccccc-0000-4000-8000-000000000001",
  lead_id: "11111111-1111-4111-8111-111111111111",
  inbound_message_id: "11111111-0000-4000-8000-0000000000aa",
  inbound_message_created_at: "2026-08-21T10:00:00Z",
  analysis_id: "ana-1",
  policy_version: AI_SALES_RECOMMENDATION_POLICY_V1,
  status: "recorded",
  recommended_action: "suggest_follow_up",
  cited_analysis_action: "create_follow_up",
  requires_human_approval: false,
  mapped_tool_name: "create_follow_up",
  reason_codes: ["cited_model_action"],
  pipeline_snapshot: {},
  error_code: null,
  requested_by_user_id: "00000000-0000-4000-8000-000000000001",
  trigger_source: "operator",
  channel_identity_id: null,
  created_at: "2026-08-21T10:01:00Z",
  updated_at: "2026-08-21T10:01:00Z",
};

const freshFollowUp: AiSalesRecommendationDecision = {
  recommendedAction: "suggest_follow_up",
  mappedToolName: "create_follow_up",
  requiresHumanApproval: false,
  reasonCodes: ["cited_model_action"],
};

describe("execution policy predicates", () => {
  it("matches persisted and live follow-up decisions", () => {
    expect(decisionsMatch(persisted, freshFollowUp)).toBe(true);
    expect(isExecutableFollowUp(persisted, freshFollowUp)).toBe(true);
  });

  it("does not treat appointment recommendations as executable follow-ups", () => {
    const appointment = {
      ...persisted,
      recommended_action: "suggest_appointment_approval" as const,
      mapped_tool_name: "create_appointment" as const,
      requires_human_approval: true,
    };
    const fresh: AiSalesRecommendationDecision = {
      recommendedAction: "suggest_appointment_approval",
      mappedToolName: "create_appointment",
      requiresHumanApproval: true,
      reasonCodes: ["cited_model_action"],
    };
    expect(decisionsMatch(appointment, fresh)).toBe(true);
    expect(isExecutableFollowUp(appointment, fresh)).toBe(false);
  });

  it("fails the match when the live action differs", () => {
    expect(
      decisionsMatch(persisted, {
        ...freshFollowUp,
        recommendedAction: "provide_information",
        mappedToolName: null,
      })
    ).toBe(false);
  });
});
