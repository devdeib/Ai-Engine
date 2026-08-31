/**
 * Tests for ConversationMessage — inbound/outbound distinction, timestamp,
 * and outbound delivery truth.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationMessage } from "./conversation-message";
import type { MessageWithDeliveryStatus } from "@/lib/db/types";

const message: MessageWithDeliveryStatus = {
  id: "11111111-0000-4000-8000-0000000000aa",
  organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
  conversation_id: "cccccccc-0000-4000-8000-000000000001",
  author_user_id: "00000000-0000-4000-8000-000000000001",
  author_type: "human",
  direction: "outbound",
  body: "Hello there",
  in_reply_to_message_id: null,
  channel_identity_id: null,
  created_at: "2026-08-01T10:05:00Z",
  delivery_status: "not_applicable",
};

describe("ConversationMessage", () => {
  it("labels in-app outbound messages as Sent and does not expose ids", () => {
    render(<ConversationMessage message={message} />);
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.queryByText(message.id)).not.toBeInTheDocument();
    expect(screen.getByRole("time")).toHaveAttribute(
      "dateTime",
      "2026-08-01T10:05:00Z"
    );
  });

  it("labels inbound messages as Received", () => {
    render(
      <ConversationMessage
        message={{ ...message, direction: "inbound", delivery_status: null }}
      />
    );
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("labels in-app AI outbound messages as AI", () => {
    render(
      <ConversationMessage
        message={{
          ...message,
          author_user_id: null,
          author_type: "ai",
          direction: "outbound",
          delivery_status: "not_applicable",
        }}
      />
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
    expect(screen.queryByText("Queued")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("labels external outbound queued as Queued", () => {
    render(
      <ConversationMessage message={{ ...message, delivery_status: "queued" }} />
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });

  it("labels external outbound sent as Sent", () => {
    render(
      <ConversationMessage message={{ ...message, delivery_status: "sent" }} />
    );
    expect(screen.getByText("Sent")).toBeInTheDocument();
  });

  it("labels external outbound failed as Failed", () => {
    render(
      <ConversationMessage message={{ ...message, delivery_status: "failed" }} />
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });

  it("does not label a missing external delivery ref as Sent", () => {
    render(
      <ConversationMessage message={{ ...message, delivery_status: null }} />
    );
    expect(screen.getByText("Queued")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });

  it("does not expose provider error details", () => {
    render(
      <ConversationMessage
        message={{
          ...message,
          delivery_status: "failed",
        }}
      />
    );
    expect(screen.queryByText(/provider/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/error_code/i)).not.toBeInTheDocument();
  });
});
