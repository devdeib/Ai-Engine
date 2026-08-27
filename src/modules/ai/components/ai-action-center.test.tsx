import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiActionCenter } from "./ai-action-center";
import type { AiActionCenter as AiActionCenterData } from "@/modules/ai/action-center/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";
import { actionCenterConversationHref } from "@/modules/ai/action-center/constants";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function pendingAction(): AiToolActionPublic {
  return {
    id: ACTION_1,
    toolName: "create_appointment",
    trust: "human_approval",
    status: "pending",
    conversationId: CONV_1,
    createdAt: "2026-08-22T09:00:00Z",
    expiresAt: "2026-08-23T09:00:00Z",
    lead: { firstName: "Ahmed", lastName: "Ali", companyName: null },
    summary: {
      startsAt: "2026-08-22T10:00:00Z",
      location: "West Bay",
    },
  };
}

function center(
  overrides: Partial<AiActionCenterData> = {}
): AiActionCenterData {
  return {
    pendingActions: [],
    recommendationItems: [],
    counts: {
      pendingAppointments: 0,
      appointmentRecommendations: 0,
      handoffRecommendations: 0,
      total: 0,
    },
    ...overrides,
  };
}

function mockFetch(payload: AiActionCenterData, pending: AiToolActionPublic[] = []) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/ai/action-center")) {
      return {
        ok: true,
        json: async () => ({ data: payload }),
      } as Response;
    }
    if (url.includes("/approve") || url.includes("/reject")) {
      return {
        ok: true,
        json: async () => ({ data: { status: "executed" } }),
      } as Response;
    }
    if (url.includes("/ai/actions")) {
      return {
        ok: true,
        json: async () => ({ data: pending }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });
}

describe("AiActionCenter", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders the empty state when nothing needs attention", async () => {
    mockFetch(center());
    render(<AiActionCenter organizationId={ORG_A} />);

    expect(await screen.findByText("No action needed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI Action Center" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Execute" })).not.toBeInTheDocument();
  });

  it("renders pending appointment HITL with existing Approve controls", async () => {
    mockFetch(
      center({
        pendingActions: [pendingAction()],
        counts: {
          pendingAppointments: 1,
          appointmentRecommendations: 0,
          handoffRecommendations: 0,
          total: 1,
        },
      }),
      [pendingAction()]
    );

    render(<AiActionCenter organizationId={ORG_A} />);

    expect(
      await screen.findByText("Appointment approval pending")
    ).toBeInTheDocument();
    expect(await screen.findByText("Proposed appointment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      actionCenterConversationHref(CONV_1)
    );
  });

  it("renders appointment scheduling and handoff recommendations with navigation only", async () => {
    mockFetch(
      center({
        recommendationItems: [
          {
            id: "rec-apt",
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
          },
          {
            id: "rec-hand",
            kind: "human_handoff_recommended",
            conversationId: CONV_2,
            recommendedAction: "suggest_human_handoff",
            planKind: "blocked_no_auto_escalation",
            executable: false,
            observability: "not_on_ledger",
            skipReason: "blocked_no_auto_escalation",
            ledger: null,
            createdAt: "2026-08-21T11:01:00Z",
            lead: { firstName: "Sara", lastName: "Nasser", companyName: null },
            href: actionCenterConversationHref(CONV_2),
          },
        ],
        counts: {
          pendingAppointments: 0,
          appointmentRecommendations: 1,
          handoffRecommendations: 1,
          total: 2,
        },
      })
    );

    render(<AiActionCenter organizationId={ORG_A} />);

    expect(
      await screen.findByText("Appointment needs scheduling")
    ).toBeInTheDocument();
    expect(screen.getByText("Human handoff recommended")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText("Sara Nasser")).toBeInTheDocument();
    expect(screen.getByText(/Review \/ Schedule/)).toBeInTheDocument();
    expect(screen.getByText(/Review \/ Take over/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for a human schedule")).toBeInTheDocument();
    expect(screen.getByText("Waiting for operator take-over")).toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: "Open conversation" });
    expect(links[0]).toHaveAttribute("href", actionCenterConversationHref(CONV_1));
    expect(links[1]).toHaveAttribute("href", actionCenterConversationHref(CONV_2));

    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /approve recommendation/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /auto/i })).not.toBeInTheDocument();
  });

  it("approves pending HITL with an empty JSON body from the existing panel", async () => {
    const user = userEvent.setup();
    mockFetch(
      center({
        pendingActions: [pendingAction()],
        counts: {
          pendingAppointments: 1,
          appointmentRecommendations: 0,
          handoffRecommendations: 0,
          total: 1,
        },
      }),
      [pendingAction()]
    );

    render(<AiActionCenter organizationId={ORG_A} />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    const approveCall = vi
      .mocked(global.fetch)
      .mock.calls.find((call) => String(call[0]).includes("/approve"));
    expect(approveCall).toBeDefined();
    expect(JSON.parse(String((approveCall?.[1] as RequestInit).body))).toEqual({});
  });
});
