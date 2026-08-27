import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiOperatorInsightPanel } from "./ai-operator-insight-panel";
import type { PublicAiSalesAnalysis } from "@/modules/ai/analysis/map";
import type { PublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";
import type { AiPipelineSnapshot } from "@/modules/ai/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

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

function analysis(): PublicAiSalesAnalysis {
  return {
    id: "ana-1",
    status: "recorded",
    schemaVersion: "AI_SALES_ANALYSIS_V1",
    promptVersion: "AI_SALES_ANALYSIS_PROMPT_V1",
    createdAt: "2026-08-21T10:01:00Z",
    inboundMessageCreatedAt: "2026-08-21T10:00:00Z",
    isCurrent: true,
    pipeline,
    analysis: {
      inboundIntent: "general_question",
      objection: "none",
      urgency: "medium",
      qualification: "qualifying",
      inferredStage: "qualifying",
      buyingSignals: [],
      missingInformation: [],
      nextBestAction: "create_follow_up",
      rationale: "Customer asked for a callback later.",
      confidence: 0.8,
    },
  };
}

function recommendation(
  overrides: Partial<PublicAiSalesRecommendation> = {}
): PublicAiSalesRecommendation {
  return {
    id: "rec-1",
    status: "recorded",
    policyVersion: "AI_SALES_RECOMMENDATION_POLICY_V1",
    createdAt: "2026-08-21T10:01:00Z",
    inboundMessageCreatedAt: "2026-08-21T10:00:00Z",
    isCurrent: true,
    recommendedAction: "suggest_follow_up",
    citedAnalysisAction: "create_follow_up",
    requiresHumanApproval: false,
    mappedToolName: "create_follow_up",
    reasonCodes: ["cited_model_action"],
    pipeline,
    plan: {
      kind: "executable_follow_up",
      executable: true,
      observability: "not_on_ledger",
      skipReason: null,
      ledger: null,
    },
    ...overrides,
  };
}

function ok(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  };
}

describe("AiOperatorInsightPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders analysis, recommendation, and executable plan without mutation controls", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) return ok(recommendation());
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(await screen.findByText("Current analysis")).toBeInTheDocument();
    expect(screen.getByText(/create follow up/i)).toBeInTheDocument();
    expect(screen.getByText(/suggest follow up/i)).toBeInTheDocument();
    expect(
      screen.getByText("Follow-up allowed by current policy")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Current policy would allow follow-up execution/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Not on execution ledger/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take over conversation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request approval/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run recommendation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve recommendation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject recommendation/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/starts at/i)).not.toBeInTheDocument();
  });

  it("renders a blocked appointment plan", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            recommendedAction: "suggest_appointment_approval",
            mappedToolName: "create_appointment",
            requiresHumanApproval: true,
            plan: {
              kind: "blocked_missing_schedule",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_missing_schedule",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(
      await screen.findByText("Appointment blocked — missing schedule")
    ).toBeInTheDocument();
    expect(screen.getByText(/Not currently executable/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Request appointment approval" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request approval" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take over conversation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("does not show the schedule form for a stale appointment recommendation", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            isCurrent: false,
            recommendedAction: "suggest_appointment_approval",
            mappedToolName: "create_appointment",
            requiresHumanApproval: true,
            plan: {
              kind: "blocked_missing_schedule",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_missing_schedule",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(
      await screen.findByText("Appointment blocked — missing schedule")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Request appointment approval" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("posts a human-authored startsAt and does not book directly", async () => {
    const onRequested = vi.fn();
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.includes("/appointment-request")) {
        return ok(
          {
            id: "action-1",
            toolName: "create_appointment",
            trust: "human_approval",
            status: "pending",
          },
          201
        );
      }
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            recommendedAction: "suggest_appointment_approval",
            mappedToolName: "create_appointment",
            requiresHumanApproval: true,
            plan: {
              kind: "blocked_missing_schedule",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_missing_schedule",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel
        organizationId={ORG_A}
        conversationId={CONV_1}
        onAppointmentRequested={onRequested}
      />
    );

    fireEvent.change(await screen.findByLabelText("Start"), {
      target: { value: "2026-08-22T10:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request approval" }));

    await waitFor(() => {
      const post = vi
        .mocked(global.fetch)
        .mock.calls.find(
          (call) =>
            String(call[0]).includes("/appointment-request") &&
            ((call[1] as RequestInit | undefined)?.method ?? "GET") === "POST"
        );
      expect(post).toBeDefined();
      const parsed = JSON.parse(String((post?.[1] as RequestInit).body));
      expect(parsed.startsAt).toBeTruthy();
      expect(parsed).not.toHaveProperty("organizationId");
      expect(parsed).not.toHaveProperty("leadId");
      expect(JSON.stringify(parsed)).not.toContain("Customer asked for a callback later.");
    });
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
  });

  it("shows Take over conversation for a blocked handoff plan", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            recommendedAction: "suggest_human_handoff",
            mappedToolName: null,
            requiresHumanApproval: false,
            plan: {
              kind: "blocked_no_auto_escalation",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_no_auto_escalation",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(await screen.findByText("Handoff is not auto-run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take over conversation" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Request appointment approval" })).not.toBeInTheDocument();
  });

  it("does not show Take over for a stale handoff recommendation", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            isCurrent: false,
            recommendedAction: "suggest_human_handoff",
            mappedToolName: null,
            requiresHumanApproval: false,
            plan: {
              kind: "blocked_no_auto_escalation",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_no_auto_escalation",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(await screen.findByText("Handoff is not auto-run")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Take over conversation" })
    ).not.toBeInTheDocument();
  });

  it("posts an empty body when taking over a conversation", async () => {
    const onHandoff = vi.fn();
    const updated = {
      id: CONV_1,
      organization_id: ORG_A,
      requires_human: true,
      ai_paused_at: "2026-08-21T12:00:00Z",
    };
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.includes("/handoff")) {
        return ok(updated, 200);
      }
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            recommendedAction: "suggest_human_handoff",
            mappedToolName: null,
            requiresHumanApproval: false,
            plan: {
              kind: "blocked_no_auto_escalation",
              executable: false,
              observability: "not_on_ledger",
              skipReason: "blocked_no_auto_escalation",
              ledger: null,
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel
        organizationId={ORG_A}
        conversationId={CONV_1}
        onHandoffConfirmed={onHandoff}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Take over conversation" }));

    await waitFor(() => {
      const post = vi
        .mocked(global.fetch)
        .mock.calls.find(
          (call) =>
            String(call[0]).includes("/recommendations/current/handoff") &&
            ((call[1] as RequestInit | undefined)?.method ?? "GET") === "POST"
        );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({});
    });
    await waitFor(() => expect(onHandoff).toHaveBeenCalled());
  });

  it("renders ledger state on the plan", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/ai/analyses/current")) return ok(analysis());
      if (url.includes("/ai/recommendations/current")) {
        return ok(
          recommendation({
            plan: {
              kind: "already_executed",
              executable: false,
              observability: "on_ledger",
              skipReason: "already_has_tool_action",
              ledger: {
                actionId: "action-1",
                toolName: "create_follow_up",
                status: "executed",
                trust: "autonomous",
              },
            },
          })
        );
      }
      return ok(null, 404);
    });

    render(
      <AiOperatorInsightPanel organizationId={ORG_A} conversationId={CONV_1} />
    );

    expect(await screen.findByText("Already executed")).toBeInTheDocument();
    expect(screen.getByText(/On execution ledger/)).toBeInTheDocument();
    expect(screen.getByText(/Ledger: create follow up · executed/)).toBeInTheDocument();
  });
});
