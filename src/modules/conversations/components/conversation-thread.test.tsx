/**
 * Tests for ConversationThread — messages, status, 404, composer wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ConversationThread } from "./conversation-thread";
import type { ConversationWithLead, Message } from "@/lib/db/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/modules/ai/components/pending-ai-actions-panel", () => ({
  PendingAiActionsPanel: () => null,
}));

vi.mock("@/modules/ai/components/ai-operator-insight-panel", () => ({
  AiOperatorInsightPanel: () => null,
}));

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeConversation(
  overrides: Partial<ConversationWithLead> = {}
): ConversationWithLead {
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
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "11111111-0000-4000-8000-0000000000aa",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    author_user_id: "00000000-0000-4000-8000-000000000001",
    author_type: "human",
    direction: "outbound",
    body: "Hello from us",
    in_reply_to_message_id: null,
    channel_identity_id: null,
    created_at: "2026-08-01T10:05:00Z",
    ...overrides,
  };
}

function ok(data: unknown, meta?: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (meta ? { data, meta } : { data }),
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("ConversationThread", () => {
  it("shows a loading skeleton while messages load", () => {
    global.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    const { container } = render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders an empty message state", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok([], { page: 1, limit: 20, count: 0 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByLabelText(/write a message/i)).toBeEnabled();
  });

  it("renders inbound and outbound messages in chronological order", async () => {
    const inbound = makeMessage({
      id: "11111111-0000-4000-8000-0000000000aa",
      direction: "inbound",
      body: "I am interested",
      created_at: "2026-08-01T10:00:00Z",
    });
    const outbound = makeMessage({
      id: "11111111-0000-4000-8000-0000000000bb",
      direction: "outbound",
      body: "Happy to help",
      created_at: "2026-08-01T10:05:00Z",
    });
    global.fetch = vi.fn().mockResolvedValue(
      ok([inbound, outbound], { page: 1, limit: 20, count: 2 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    const list = await screen.findByRole("list", { name: /messages/i });
    const items = list.querySelectorAll("li");
    expect(items[0]).toHaveTextContent("I am interested");
    expect(items[0]).toHaveTextContent("Received");
    expect(items[1]).toHaveTextContent("Happy to help");
    expect(items[1]).toHaveTextContent("Sent");
  });

  it("shows a retry action when the thread fails to load", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "fail" } }),
    });

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByText("Failed to load messages")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("shows not-found when the conversation is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "not found" } }),
    });

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByText("Conversation not found")).toBeInTheDocument();
  });

  it("shows Close for an open conversation and PATCHes status without identity fields", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const onListRefresh = vi.fn();
    global.fetch = vi.fn().mockImplementation(async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "PATCH") {
        return ok(makeConversation({ status: "closed" }));
      }
      return ok([], { page: 1, limit: 20, count: 0 });
    });

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({ status: "open" })}
        onBack={vi.fn()}
        onConversationUpdated={onUpdated}
        onListRefresh={onListRefresh}
      />
    );

    const close = await screen.findByRole("button", { name: /close conversation/i });
    await user.click(close);

    await waitFor(() => expect(onUpdated).toHaveBeenCalled());
    const patchCall = vi
      .mocked(global.fetch)
      .mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === "PATCH");
    expect(patchCall).toBeDefined();
    const parsed = JSON.parse(String((patchCall?.[1] as RequestInit).body));
    expect(parsed).toEqual({ status: "closed" });
    expect(parsed).not.toHaveProperty("organization_id");
    expect(parsed).not.toHaveProperty("lead_id");
    expect(parsed).not.toHaveProperty("requires_human");
    expect(onListRefresh).toHaveBeenCalled();
  });

  it("shows Reopen for a closed conversation and disables the composer", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok([], { page: 1, limit: 20, count: 0 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({ status: "closed" })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(
      await screen.findByRole("button", { name: /reopen conversation/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/write a message/i)).toBeDisabled();
  });

  it("shows AI active controls for an open conversation", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok([], { page: 1, limit: 20, count: 0 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByText("AI active")).toBeInTheDocument();
    expect(screen.getByLabelText("Pause AI")).toBeEnabled();
    expect(screen.getByLabelText("Generate AI reply")).toBeEnabled();
  });

  it("refreshes messages and the conversation list after a successful send", async () => {
    const user = userEvent.setup();
    const onListRefresh = vi.fn();
    global.fetch = vi.fn().mockImplementation(async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST") {
        return ok(makeMessage(), undefined, 201);
      }
      return ok([], { page: 1, limit: 20, count: 0 });
    });

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={onListRefresh}
      />
    );

    await screen.findByText("No messages yet");
    await user.type(screen.getByLabelText(/write a message/i), "Hello");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(onListRefresh).toHaveBeenCalled());
    const getCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter((call) => String(call[0]).includes("/messages"))
      .filter((call) => ((call[1] as RequestInit | undefined)?.method ?? "GET") !== "POST");
    expect(getCalls.length).toBeGreaterThan(1);
  });

  it("does not request identity APIs for in-app conversations", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok([], { page: 1, limit: 20, count: 0 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation()}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    await screen.findByText("No messages yet");
    const urls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/channel-identities/"))).toBe(false);
    expect(urls.some((url) => url.includes("/leads/"))).toBe(false);
    expect(urls.some((url) => url.includes("secret") || url.includes("rotate"))).toBe(
      false
    );
    expect(screen.queryByTestId("inbox-identity-state")).not.toBeInTheDocument();
  });

  it("loads WhatsApp identity address and marks a real lead as Linked", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("secret") || url.includes("rotate")) {
        throw new Error("secret endpoints must not be requested");
      }
      if (url.includes(`/channel-identities/${IDENTITY_ID}`)) {
        return ok({
          id: IDENTITY_ID,
          organizationId: ORG_A,
          channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          externalAddress: "+97455551234",
          leadId: LEAD_1,
          createdAt: "2026-08-01T10:00:00Z",
        });
      }
      if (url.includes(`/leads/${LEAD_1}`)) {
        return ok({
          id: LEAD_1,
          first_name: "Ahmed",
          last_name: "Hassan",
          email: "ahmed@example.com",
          phone: "+97455551234",
        });
      }
      if (url.includes("/messages")) {
        return ok([], { page: 1, limit: 20, count: 0 });
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({
          channel: "whatsapp",
          channel_identity_id: IDENTITY_ID,
          lead: {
            id: LEAD_1,
            first_name: "Ahmed",
            last_name: "Hassan",
            company_name: null,
          },
        })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByTestId("inbox-identity-address")).toHaveTextContent(
      "+97455551234"
    );
    expect(screen.getByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity: Linked"
    );
    expect(screen.getByText("Ahmed Hassan")).toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("marks a channel stub lead as Unmatched", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes(`/channel-identities/${IDENTITY_ID}`)) {
        return ok({
          id: IDENTITY_ID,
          externalAddress: "+97455551234",
          leadId: LEAD_1,
        });
      }
      if (url.includes(`/leads/${LEAD_1}`)) {
        return ok({
          id: LEAD_1,
          first_name: "Unknown",
          last_name: "Customer",
          email: null,
          phone: null,
        });
      }
      return ok([], { page: 1, limit: 20, count: 0 });
    }) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({
          channel: "whatsapp",
          channel_identity_id: IDENTITY_ID,
          lead: {
            id: LEAD_1,
            first_name: "Unknown",
            last_name: "Customer",
            company_name: null,
          },
        })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByText("Unknown Customer")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity: Unmatched"
    );
  });

  it("shows identity unavailable when an external conversation has no identity", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      ok([], { page: 1, limit: 20, count: 0 })
    ) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({
          channel: "email",
          channel_identity_id: null,
        })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity unavailable"
    );
    expect(screen.queryByTestId("inbox-identity-address")).not.toBeInTheDocument();
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    const urls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/channel-identities/"))).toBe(false);
  });

  it("keeps the thread usable when identity lookup returns 404", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/channel-identities/")) {
        return { ok: false, status: 404, json: async () => ({ error: { message: "missing" } }) };
      }
      if (url.includes("/leads/")) {
        return ok({
          id: LEAD_1,
          first_name: "Ahmed",
          last_name: "Hassan",
          email: "ahmed@example.com",
          phone: null,
        });
      }
      return ok([], { page: 1, limit: 20, count: 0 });
    }) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({
          channel: "sms",
          channel_identity_id: IDENTITY_ID,
        })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity unavailable"
    );
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByLabelText(/write a message/i)).toBeEnabled();
  });

  it("keeps the thread usable when identity lookup fails", async () => {
    global.fetch = vi.fn().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/channel-identities/")) {
        return { ok: false, status: 500, json: async () => ({ error: { message: "fail" } }) };
      }
      return ok([], { page: 1, limit: 20, count: 0 });
    }) as unknown as typeof fetch;

    render(
      <ConversationThread
        organizationId={ORG_A}
        conversation={makeConversation({
          channel: "test",
          channel_identity_id: IDENTITY_ID,
        })}
        onBack={vi.fn()}
        onConversationUpdated={vi.fn()}
        onListRefresh={vi.fn()}
      />
    );

    expect(await screen.findByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity unavailable"
    );
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });
});
