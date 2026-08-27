/**
 * Tests for LeadConversationCard — Open vs Start Conversation on lead detail.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeadConversationCard } from "./lead-conversation-card";
import type { ConversationWithLead } from "@/lib/db/types";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

function makeConversation(): ConversationWithLead {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: null,
    channel_account_id: null,
    channel_identity_id: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T11:00:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
  mockPush.mockClear();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("LeadConversationCard", () => {
  it("shows Open Conversation when an open thread exists", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [makeConversation()] }),
    });

    render(<LeadConversationCard organizationId={ORG_A} leadId={LEAD_1} />);

    const button = await screen.findByRole("button", { name: /open conversation/i });
    await user.click(button);
    expect(mockPush).toHaveBeenCalledWith(
      `/dashboard/conversations?conversation=${CONV_1}`
    );
  });

  it("shows Start Conversation when no open thread exists", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    render(<LeadConversationCard organizationId={ORG_A} leadId={LEAD_1} />);

    expect(
      await screen.findByRole("button", { name: /start conversation/i })
    ).toBeInTheDocument();
  });

  it("creates a conversation and navigates to it", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockImplementation(async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ data: makeConversation() }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      };
    });

    render(<LeadConversationCard organizationId={ORG_A} leadId={LEAD_1} />);
    await user.click(await screen.findByRole("button", { name: /start conversation/i }));

    const dialog = screen.getByRole("dialog", { name: /start conversation/i });
    await user.click(
      dialog.querySelector("button[type='submit']") as HTMLButtonElement
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        `/dashboard/conversations?conversation=${CONV_1}`
      )
    );
  });
});
