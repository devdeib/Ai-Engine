import { describe, it, expect } from "vitest";
import {
  CONVERSATION_STATUS_LABELS,
  CONVERSATION_CHANNEL_LABELS,
  leadDisplayName,
  conversationMessageAttribution,
} from "@/modules/conversations/lib/conversation-labels";

describe("conversation labels", () => {
  it("labels open and closed statuses", () => {
    expect(CONVERSATION_STATUS_LABELS.open).toBe("Open");
    expect(CONVERSATION_STATUS_LABELS.closed).toBe("Closed");
  });

  it("labels the in_app and test channels", () => {
    expect(CONVERSATION_CHANNEL_LABELS.in_app).toBe("In App");
    expect(CONVERSATION_CHANNEL_LABELS.test).toBe("Test");
    expect(CONVERSATION_CHANNEL_LABELS.whatsapp).toBe("WhatsApp");
    expect(CONVERSATION_CHANNEL_LABELS.email).toBe("Email");
    expect(CONVERSATION_CHANNEL_LABELS.sms).toBe("SMS");
  });
});

describe("leadDisplayName", () => {
  it("joins first and last name", () => {
    expect(
      leadDisplayName({
        id: "1",
        first_name: "Ahmed",
        last_name: "Ali",
        company_name: null,
      })
    ).toBe("Ahmed Ali");
  });

  it("returns a fallback when lead is missing", () => {
    expect(leadDisplayName(null)).toBe("Unknown lead");
    expect(leadDisplayName(undefined)).toBe("Unknown lead");
  });
});

describe("conversationMessageAttribution", () => {
  const base = {
    direction: "outbound" as const,
    author_type: "human" as const,
    delivery_status: "not_applicable" as const,
  };

  it("labels inbound messages as Received", () => {
    expect(
      conversationMessageAttribution({
        ...base,
        direction: "inbound",
        delivery_status: null,
      })
    ).toBe("Received");
  });

  it("labels in-app outbound as Sent", () => {
    expect(conversationMessageAttribution(base)).toBe("Sent");
  });

  it("labels in-app AI outbound as AI", () => {
    expect(
      conversationMessageAttribution({
        ...base,
        author_type: "ai",
        delivery_status: "not_applicable",
      })
    ).toBe("AI");
  });

  it("maps queued, sent, and failed for external outbound", () => {
    expect(
      conversationMessageAttribution({ ...base, delivery_status: "queued" })
    ).toBe("Queued");
    expect(
      conversationMessageAttribution({ ...base, delivery_status: "sent" })
    ).toBe("Sent");
    expect(
      conversationMessageAttribution({ ...base, delivery_status: "failed" })
    ).toBe("Failed");
  });

  it("does not treat a missing external delivery status as Sent", () => {
    expect(
      conversationMessageAttribution({ ...base, delivery_status: null })
    ).toBe("Queued");
  });

  it("keeps AI authorship on external delivery states", () => {
    expect(
      conversationMessageAttribution({
        ...base,
        author_type: "ai",
        delivery_status: "queued",
      })
    ).toBe("AI · Queued");
    expect(
      conversationMessageAttribution({
        ...base,
        author_type: "ai",
        delivery_status: "failed",
      })
    ).toBe("AI · Failed");
  });
});
