import { describe, it, expect } from "vitest";
import { decideAiAction } from "@/modules/ai/decisions";
import type { Conversation, Message } from "@/lib/db/types";

const conversation: Pick<
  Conversation,
  "status" | "requires_human" | "ai_paused_at"
> = {
  status: "open",
  requires_human: false,
  ai_paused_at: null,
};

function inbound(id = "in-1"): Pick<
  Message,
  "id" | "direction" | "in_reply_to_message_id"
> {
  return { id, direction: "inbound", in_reply_to_message_id: null };
}

function outbound(
  id = "out-1",
  inReplyTo: string | null = null
): Pick<Message, "id" | "direction" | "in_reply_to_message_id"> {
  return { id, direction: "outbound", in_reply_to_message_id: inReplyTo };
}

describe("decideAiAction", () => {
  it("responds when the latest message is an unprocessed inbound", () => {
    expect(
      decideAiAction({ conversation, messages: [inbound("in-1")] })
    ).toEqual({ action: "respond", inboundMessageId: "in-1" });
  });

  it("skips a closed conversation", () => {
    expect(
      decideAiAction({
        conversation: { ...conversation, status: "closed" },
        messages: [inbound()],
      })
    ).toEqual({ action: "skip", reason: "closed" });
  });

  it("skips when requires_human is true", () => {
    expect(
      decideAiAction({
        conversation: { ...conversation, requires_human: true },
        messages: [inbound()],
      })
    ).toEqual({ action: "skip", reason: "requires_human" });
  });

  it("skips when AI is paused", () => {
    expect(
      decideAiAction({
        conversation: {
          ...conversation,
          ai_paused_at: "2026-08-21T10:00:00Z",
        },
        messages: [inbound()],
      })
    ).toEqual({ action: "skip", reason: "paused" });
  });

  it("skips when there are no messages", () => {
    expect(decideAiAction({ conversation, messages: [] })).toEqual({
      action: "skip",
      reason: "no_inbound",
    });
  });

  it("skips when the latest message is outbound", () => {
    expect(
      decideAiAction({
        conversation,
        messages: [inbound("in-1"), outbound("out-1")],
      })
    ).toEqual({ action: "skip", reason: "latest_outbound" });
  });

  it("skips when the inbound already has a reply", () => {
    expect(
      decideAiAction({
        conversation,
        messages: [outbound("out-1", "in-1"), inbound("in-1")],
      })
    ).toEqual({ action: "skip", reason: "already_replied" });
  });

  it("prefers requires_human over paused when both are set", () => {
    expect(
      decideAiAction({
        conversation: {
          status: "open",
          requires_human: true,
          ai_paused_at: "2026-08-21T10:00:00Z",
        },
        messages: [inbound()],
      })
    ).toEqual({ action: "skip", reason: "requires_human" });
  });
});
