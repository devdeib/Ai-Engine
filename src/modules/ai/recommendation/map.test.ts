import { describe, it, expect } from "vitest";
import { toPublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";
import { AI_SALES_RECOMMENDATION_POLICY_V1 } from "@/modules/ai/recommendation/constants";
import type { AiSalesRecommendation } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import type { PublicExecutionPlan } from "@/modules/ai/execution/plan";

const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";
const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
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

const row: AiSalesRecommendation = {
  id: "rec-1",
  organization_id: ORG_A,
  conversation_id: "cccccccc-0000-4000-8000-000000000001",
  lead_id: "11111111-1111-4111-8111-111111111111",
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
  error_code: "AI_RECOMMENDATION_FAILED",
  requested_by_user_id: USER_1,
  trigger_source: "operator",
  channel_identity_id: null,
  created_at: "2026-08-21T10:01:00Z",
  updated_at: "2026-08-21T10:01:00Z",
};

const plan: PublicExecutionPlan = {
  kind: "no_op",
  executable: false,
  observability: "not_on_ledger",
  skipReason: null,
  ledger: null,
};

const EXISTING_FIELDS = [
  "id",
  "status",
  "policyVersion",
  "createdAt",
  "inboundMessageCreatedAt",
  "isCurrent",
  "recommendedAction",
  "citedAnalysisAction",
  "requiresHumanApproval",
  "mappedToolName",
  "reasonCodes",
  "pipeline",
] as const;

describe("toPublicAiSalesRecommendation", () => {
  it("omits tenant identity, requester, inbound UUID, analysis_id, and error_code", () => {
    const dto = toPublicAiSalesRecommendation(
      { ...row, error_code: null },
      INBOUND,
      plan
    );
    expect(dto).not.toHaveProperty("organizationId");
    expect(dto).not.toHaveProperty("organization_id");
    expect(dto).not.toHaveProperty("requested_by_user_id");
    expect(dto).not.toHaveProperty("inboundMessageId");
    expect(dto).not.toHaveProperty("analysisId");
    expect(dto).not.toHaveProperty("analysis_id");
    expect(dto).not.toHaveProperty("error_code");
    expect(dto).not.toHaveProperty("errorCode");
    const raw = JSON.stringify(dto);
    expect(raw).not.toContain(ORG_A);
    expect(raw).not.toContain(USER_1);
    expect(raw).not.toContain(INBOUND);
    expect(raw).not.toContain(ANALYSIS);
    expect(raw).not.toContain("AI_RECOMMENDATION_FAILED");
    expect(dto.isCurrent).toBe(true);
    expect(dto.policyVersion).toBe(AI_SALES_RECOMMENDATION_POLICY_V1);
    expect(dto.recommendedAction).toBe("provide_information");
  });

  it("keeps existing 4.7 fields and adds plan additively", () => {
    const dto = toPublicAiSalesRecommendation(row, INBOUND, plan);
    for (const field of EXISTING_FIELDS) {
      expect(dto).toHaveProperty(field);
    }
    expect(dto.plan).toEqual(plan);
    expect(dto.plan.kind).toBe("no_op");
    expect(dto.plan.executable).toBe(false);
  });

  it("marks recommendation stale when a later inbound exists", () => {
    const dto = toPublicAiSalesRecommendation(row, LATER, plan);
    expect(dto.isCurrent).toBe(false);
    expect(dto.plan).toEqual(plan);
  });
});
