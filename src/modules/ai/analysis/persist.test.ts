/**
 * Durable AI sales analysis persistence tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";
import type { AiSalesAnalysis } from "@/lib/db/types";
import type { AiPipelineSnapshot } from "@/modules/ai/types";
import {
  AI_SALES_ANALYSIS_PROMPT_VERSION,
  AI_SALES_ANALYSIS_SCHEMA_VERSION,
} from "@/modules/ai/analysis/constants";
import type { AiSalesAnalysisPayload } from "@/modules/ai/analysis/schema";

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
import { persistAiSalesAnalysis } from "@/modules/ai/analysis/persist";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const INBOUND = "11111111-0000-4000-8000-0000000000aa";

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

let rows: AiSalesAnalysis[] = [];

function asRow(
  overrides: Partial<AiSalesAnalysis> = {}
): AiSalesAnalysis {
  return {
    id: "ana-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    lead_id: LEAD_1,
    inbound_message_id: INBOUND,
    inbound_message_created_at: "2026-08-21T10:00:00Z",
    schema_version: AI_SALES_ANALYSIS_SCHEMA_VERSION,
    prompt_version: AI_SALES_ANALYSIS_PROMPT_VERSION,
    provider_name: "mock",
    status: "recorded",
    payload,
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
      id: `ana-${rows.length + 1}`,
      status: value.status as AiSalesAnalysis["status"],
      payload: value.payload as Record<string, unknown>,
      error_code: (value.error_code as string | null) ?? null,
      schema_version: value.schema_version as string,
      prompt_version: value.prompt_version as string,
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
    current.payload = payload;
    current.error_code = null;
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
  providerName: "mock",
  pipeline,
};

describe("persistAiSalesAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rows = [];
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    mockClient();
  });

  it("inserts a recorded analysis with server version constants", async () => {
    const stored = await persistAiSalesAnalysis({
      ...baseInput,
      payload,
      errorCode: null,
    });
    expect(stored?.status).toBe("recorded");
    expect(stored?.schema_version).toBe(AI_SALES_ANALYSIS_SCHEMA_VERSION);
    expect(stored?.prompt_version).toBe(AI_SALES_ANALYSIS_PROMPT_VERSION);
    expect(stored?.payload).toEqual(payload);
    expect(rows).toHaveLength(1);
  });

  it("inserts a failed analysis with empty payload", async () => {
    const stored = await persistAiSalesAnalysis({
      ...baseInput,
      payload: null,
      errorCode: "AI_MALFORMED_ANALYSIS",
    });
    expect(stored?.status).toBe("failed");
    expect(stored?.payload).toEqual({});
    expect(stored?.error_code).toBe("AI_MALFORMED_ANALYSIS");
  });

  it("replays a recorded row on unique inbound and does not overwrite", async () => {
    rows = [asRow({ payload: { frozen: true } })];
    const stored = await persistAiSalesAnalysis({
      ...baseInput,
      payload,
      errorCode: null,
    });
    expect(stored?.payload).toEqual({ frozen: true });
    expect(rows).toHaveLength(1);
  });

  it("upgrades failed to recorded when a later attempt validates", async () => {
    rows = [
      asRow({
        status: "failed",
        payload: {},
        error_code: "AI_MALFORMED_ANALYSIS",
      }),
    ];
    const stored = await persistAiSalesAnalysis({
      ...baseInput,
      payload,
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
        payload: {},
        error_code: "AI_PROVIDER_ERROR",
      }),
    ];
    const stored = await persistAiSalesAnalysis({
      ...baseInput,
      payload: null,
      errorCode: "AI_MALFORMED_ANALYSIS",
    });
    expect(stored?.error_code).toBe("AI_PROVIDER_ERROR");
  });

  it("rejects non-members before insert", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      persistAiSalesAnalysis({ ...baseInput, payload, errorCode: null })
    ).rejects.toThrow(TenantAccessError);
  });
});
