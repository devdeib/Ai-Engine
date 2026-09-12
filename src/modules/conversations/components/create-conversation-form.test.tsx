/**
 * Tests for CreateConversationForm — payload, 409 handling, lead picker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateConversationForm } from "./create-conversation-form";
import type { ConversationWithLead, Lead } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";

function makeLead(): Lead {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: null,
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
  };
}

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
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("CreateConversationForm", () => {
  it("creates a conversation with lead_id and channel only", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: makeConversation() }),
    });

    render(
      <CreateConversationForm
        organizationId={ORG_A}
        leadId={LEAD_1}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^start conversation$/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(String(init.body));
    expect(parsed).toEqual({ lead_id: LEAD_1, channel: "in_app" });
    expect(parsed).not.toHaveProperty("organization_id");
  });

  it("handles 409 by opening the existing conversation", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    global.fetch = vi.fn().mockImplementation(async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { message: "conflict" } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [makeConversation()] }),
      };
    });

    render(
      <CreateConversationForm
        organizationId={ORG_A}
        leadId={LEAD_1}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /^start conversation$/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(makeConversation()));
  });

  it("loads leads into the picker when leadId is not provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [makeLead()] }),
    });

    render(
      <CreateConversationForm
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(await screen.findByRole("option", { name: /ahmed ali/i })).toBeInTheDocument();
  });
});
