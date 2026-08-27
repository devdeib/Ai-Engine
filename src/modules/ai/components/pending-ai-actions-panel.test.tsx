import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingAiActionsPanel } from "./pending-ai-actions-panel";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACTION_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function makeAction(
  overrides: Partial<AiToolActionPublic> = {}
): AiToolActionPublic {
  return {
    id: ACTION_1,
    toolName: "create_appointment",
    trust: "human_approval",
    status: "pending",
    conversationId: "cccccccc-0000-4000-8000-000000000001",
    createdAt: "2026-08-22T09:00:00Z",
    expiresAt: "2026-08-23T09:00:00Z",
    lead: { firstName: "Ahmed", lastName: "Ali", companyName: null },
    summary: {
      startsAt: "2026-08-22T10:00:00Z",
      endsAt: "2026-08-22T11:00:00Z",
      location: "West Bay",
    },
    ...overrides,
  };
}

describe("PendingAiActionsPanel", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders pending appointment details without organization UUIDs", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [makeAction()] }),
    });

    render(<PendingAiActionsPanel organizationId={ORG_A} />);

    expect(await screen.findByText("Proposed appointment")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText(/West Bay/)).toBeInTheDocument();
    expect(screen.queryByText(ORG_A)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open" })).not.toBeInTheDocument();
  });

  it("links to the conversation when showConversationLink is set", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [makeAction()] }),
    });

    render(
      <PendingAiActionsPanel organizationId={ORG_A} showConversationLink />
    );

    expect(await screen.findByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/dashboard/conversations?conversation=cccccccc-0000-4000-8000-000000000001"
    );
  });

  it("approves with an empty JSON body", async () => {
    const user = userEvent.setup();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [makeAction()] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { status: "executed" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    render(<PendingAiActionsPanel organizationId={ORG_A} />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => {
      const approveCall = vi
        .mocked(global.fetch)
        .mock.calls.find((call) => String(call[0]).includes("/approve"));
      expect(approveCall).toBeDefined();
      expect(JSON.parse(String((approveCall?.[1] as RequestInit).body))).toEqual({});
    });
  });
});
