import { describe, it, expect } from "vitest";
import { toPublicAiSalesAnalysis } from "@/modules/ai/analysis/map";
import {
  AI_SALES_ANALYSIS_PROMPT_VERSION,
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import type { AiSalesAnalysis } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";

const INBOUND = "11111111-0000-4000-8000-0000000000aa";
const LATER = "22222222-0000-4000-8000-0000000000bb";

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

const payload = {
  inboundIntent: "pricing",
  objection: "none",
  urgency: "low",
  qualification: "unknown",
  inferredStage: "exploring",
  buyingSignals: [],
  missingInformation: [],
  nextBestAction: "wait_for_customer",
  rationale: "General question only.",
  confidence: 0.2,
};

const row: AiSalesAnalysis = {
  id: "ana-1",
  organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
  conversation_id: "cccccccc-0000-4000-8000-000000000001",
  lead_id: "11111111-1111-4111-8111-111111111111",
  inbound_message_id: INBOUND,
  inbound_message_created_at: "2026-08-21T10:00:00Z",
  schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
  prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
  provider_name: "mock",
  status: "recorded",
  payload,
  pipeline_snapshot: { ...pipeline },
  error_code: null,
  requested_by_user_id: "00000000-0000-4000-8000-000000000001",
  trigger_source: "operator",
  channel_identity_id: null,
  created_at: "2026-08-21T10:01:00Z",
  updated_at: "2026-08-21T10:01:00Z",
};

describe("toPublicAiSalesAnalysis", () => {
  it("omits tenant identity, requester, error_code, and inbound UUID", () => {
    const dto = toPublicAiSalesAnalysis(row, INBOUND);
    expect(dto).not.toHaveProperty("organizationId");
    expect(dto).not.toHaveProperty("organization_id");
    expect(dto).not.toHaveProperty("requested_by_user_id");
    expect(dto).not.toHaveProperty("error_code");
    expect(dto).not.toHaveProperty("inboundMessageId");
    expect(JSON.stringify(dto)).not.toContain(row.organization_id);
    expect(JSON.stringify(dto)).not.toContain(row.requested_by_user_id);
    expect(dto.isCurrent).toBe(true);
    expect(dto.schemaVersion).toBe(AI_SALES_ANALYSIS_SCHEMA_VERSION);
    expect(dto.promptVersion).toBe(AI_SALES_ANALYSIS_PROMPT_VERSION);
    expect(dto.analysis).toEqual(payload);
  });

  it("marks analysis stale when a later inbound exists", () => {
    const dto = toPublicAiSalesAnalysis(row, LATER);
    expect(dto.isCurrent).toBe(false);
  });

  it("returns null analysis for failed rows", () => {
    const dto = toPublicAiSalesAnalysis(
      { ...row, status: "failed", payload: {}, error_code: "AI_MALFORMED_ANALYSIS" },
      INBOUND
    );
    expect(dto.status).toBe("failed");
    expect(dto.analysis).toBeNull();
    expect(JSON.stringify(dto)).not.toContain("AI_MALFORMED_ANALYSIS");
  });
});
