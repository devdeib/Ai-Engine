import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { ConversationHeader } from "./conversation-header";
import type { ConversationWithLead } from "@/lib/db/types";

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
      last_name: "Hassan",
      company_name: null,
    },
    ...overrides,
  };
}

const identityReady = {
  status: "ready" as const,
  externalAddress: "+97455551234",
  linkState: "linked" as const,
};

describe("ConversationHeader identity visibility", () => {
  it("does not show a fake external address for in-app conversations", () => {
    render(
      <ConversationHeader
        conversation={makeConversation()}
        isUpdating={false}
        onBack={vi.fn()}
        onToggleStatus={vi.fn()}
        identity={{ status: "hidden", externalAddress: null, linkState: null }}
      />
    );

    expect(screen.getByText("Ahmed Hassan")).toBeInTheDocument();
    expect(screen.getByText(/In App/)).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-identity-address")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inbox-identity-state")).not.toBeInTheDocument();
  });

  it.each([
    ["whatsapp", "WhatsApp", "+97455551234"],
    ["sms", "SMS", "+123456789"],
    ["email", "Email", "customer@example.com"],
    ["test", "Test", "dest-1"],
  ] as const)("shows the %s external address", (channel, label, address) => {
    render(
      <ConversationHeader
        conversation={makeConversation({
          channel,
          channel_identity_id: IDENTITY_ID,
        })}
        isUpdating={false}
        onBack={vi.fn()}
        onToggleStatus={vi.fn()}
        identity={{
          status: "ready",
          externalAddress: address,
          linkState: "linked",
        }}
      />
    );

    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    expect(screen.getByTestId("inbox-identity-address")).toHaveTextContent(address);
    expect(screen.getByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity: Linked"
    );
    expect(screen.queryByText("webhookSecret")).not.toBeInTheDocument();
  });

  it("distinguishes an unmatched stub from a linked CRM lead", () => {
    render(
      <ConversationHeader
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
        isUpdating={false}
        onBack={vi.fn()}
        onToggleStatus={vi.fn()}
        identity={{
          status: "ready",
          externalAddress: "+97455551234",
          linkState: "unmatched",
        }}
      />
    );

    expect(screen.getByText("Unknown Customer")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity: Unmatched"
    );
  });

  it("does not crash when the conversation has no lead", () => {
    render(
      <ConversationHeader
        conversation={makeConversation({
          channel: "whatsapp",
          channel_identity_id: IDENTITY_ID,
          lead: null,
        })}
        isUpdating={false}
        onBack={vi.fn()}
        onToggleStatus={vi.fn()}
        identity={identityReady}
      />
    );

    expect(screen.getByText("Unknown lead")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-identity-address")).toHaveTextContent(
      "+97455551234"
    );
    expect(screen.queryByRole("link", { name: /view lead/i })).not.toBeInTheDocument();
  });

  it("shows a neutral unavailable state without fabricating an address", () => {
    render(
      <ConversationHeader
        conversation={makeConversation({
          channel: "whatsapp",
          channel_identity_id: null,
        })}
        isUpdating={false}
        onBack={vi.fn()}
        onToggleStatus={vi.fn()}
        identity={{
          status: "unavailable",
          externalAddress: null,
          linkState: null,
        }}
      />
    );

    expect(screen.getByTestId("inbox-identity-state")).toHaveTextContent(
      "Identity unavailable"
    );
    expect(screen.queryByTestId("inbox-identity-address")).not.toBeInTheDocument();
  });
});
