/**
 * Tests for ConversationMessage — inbound/outbound distinction and timestamp.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationMessage } from "./conversation-message";
import type { Message } from "@/lib/db/types";

const message: Message = {
  id: "11111111-0000-4000-8000-0000000000aa",
  organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
  conversation_id: "cccccccc-0000-4000-8000-000000000001",
  author_user_id: "00000000-0000-4000-8000-000000000001",
  author_type: "human",
  direction: "outbound",
  body: "Hello there",
  in_reply_to_message_id: null,
  created_at: "2026-08-01T10:05:00Z",
};

describe("ConversationMessage", () => {
  it("labels outbound messages as Sent and does not expose ids", () => {
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
      <ConversationMessage message={{ ...message, direction: "inbound" }} />
    );
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("labels AI outbound messages as AI", () => {
    render(
      <ConversationMessage
        message={{
          ...message,
          author_user_id: null,
          author_type: "ai",
          direction: "outbound",
        }}
      />
    );
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.queryByText("Sent")).not.toBeInTheDocument();
  });
});
