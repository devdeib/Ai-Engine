import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  normalizeEmailAddress,
  parseEmailInbound,
  toCanonicalEmailInbound,
} from "@/modules/channels/adapters/email/parse";

const MAILBOX = "sales@acme.example";

function receivedEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: "email.received",
    created_at: "2026-08-27T13:00:00.000Z",
    data: {
      email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
      created_at: "2026-08-27T13:00:00.000Z",
      from: "Lead Person <buyer@example.com>",
      to: ["Sales Desk <sales@acme.example>"],
      subject: "ignored",
      cc: ["cc@example.com"],
      bcc: [],
      text: "Hello from email",
      ...overrides,
    },
  };
}

describe("Email address normalization", () => {
  it("trims, extracts angle-bracket addresses, and lowercases", () => {
    expect(normalizeEmailAddress("  Buyer@Example.COM  ")).toBe(
      "buyer@example.com"
    );
    expect(normalizeEmailAddress("Lead Person <Buyer@Example.COM>")).toBe(
      "buyer@example.com"
    );
  });

  it("does not apply Gmail dot or plus-address rewriting", () => {
    expect(normalizeEmailAddress("first.last+tag@gmail.com")).toBe(
      "first.last+tag@gmail.com"
    );
  });
});

describe("Email inbound parse", () => {
  it("maps a received text event to CanonicalInbound without subject or html", () => {
    const parsed = parseEmailInbound(receivedEvent(), MAILBOX);
    expect(parsed).toEqual({
      status: "inbound",
      event: {
        providerMessageId: "56761188-7520-42d8-8898-ff6fc54ce618",
        from: "buyer@example.com",
        to: MAILBOX,
        body: "Hello from email",
        occurredAt: "2026-08-27T13:00:00.000Z",
      },
    });
    if (parsed.status === "inbound") {
      expect(parsed.event).not.toHaveProperty("subject");
      expect(parsed.event).not.toHaveProperty("html");
      expect(parsed.event).not.toHaveProperty("organizationId");
    }
  });

  it("ignores delivered, bounced, opened, and other envelopes", () => {
    expect(parseEmailInbound({ type: "email.delivered", data: {} })).toEqual({
      status: "ignored",
    });
    expect(parseEmailInbound({ type: "email.bounced", data: {} })).toEqual({
      status: "ignored",
    });
    expect(parseEmailInbound({ type: "email.opened", data: {} })).toEqual({
      status: "ignored",
    });
  });

  it("ignores metadata-only received events with no text body", () => {
    expect(
      parseEmailInbound(receivedEvent({ text: undefined }), MAILBOX)
    ).toEqual({ status: "ignored" });
  });

  it("throws on malformed received metadata", () => {
    expect(() => parseEmailInbound(receivedEvent({ email_id: "" }))).toThrow(
      ValidationError
    );
    expect(() => parseEmailInbound(receivedEvent({ from: "" }))).toThrow(
      ValidationError
    );
    expect(() => parseEmailInbound(receivedEvent({ to: [] }))).toThrow(
      ValidationError
    );
  });

  it("selects the tenant mailbox when multiple recipients are present", () => {
    const parsed = toCanonicalEmailInbound({
      emailId: "msg-1",
      from: "buyer@example.com",
      recipients: ["other@example.com", MAILBOX],
      text: "Hi",
      destination: MAILBOX,
    });
    expect(parsed.status).toBe("inbound");
    if (parsed.status === "inbound") {
      expect(parsed.event.to).toBe(MAILBOX);
    }
  });
});
