import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthenticationError, ValidationError } from "@/lib/errors";
import {
  normalizeSmsAddress,
  parseSmsInbound,
} from "@/modules/channels/adapters/sms/parse";

const DEST = "+17735550001";
const FROM = "+17735550002";
const MSG_ID = "403193d5-6802-43c2-bd39-10487abff809";

function receivedEvent(overrides: Record<string, unknown> = {}) {
  const payloadOverrides =
    typeof overrides.payload === "object" && overrides.payload !== null
      ? (overrides.payload as Record<string, unknown>)
      : {};
  const { payload: _payload, ...dataOverrides } = overrides;
  return {
    data: {
      event_type: "message.received",
      id: "webhook-event-id-must-not-be-used",
      occurred_at: "2026-08-28T13:00:00.000Z",
      payload: {
        id: MSG_ID,
        organization_id: "telnyx-org-must-never-be-trusted",
        type: "SMS",
        text: "Hello from SMS",
        from: { phone_number: FROM },
        to: [{ phone_number: DEST }],
        received_at: "2026-08-28T12:59:59.000Z",
        ...payloadOverrides,
      },
      ...dataOverrides,
    },
  };
}

describe("SMS address normalization", () => {
  it("keeps a canonical E.164 number unchanged", () => {
    expect(normalizeSmsAddress("+17735550002")).toBe("+17735550002");
  });

  it("trims whitespace", () => {
    expect(normalizeSmsAddress("  +17735550002  ")).toBe("+17735550002");
  });

  it("extracts a number from Name <number> form", () => {
    expect(normalizeSmsAddress("Lead Person <+17735550002>")).toBe(
      "+17735550002"
    );
  });

  it("strips formatting characters after a leading plus", () => {
    expect(normalizeSmsAddress("+1 (773) 555-0002")).toBe("+17735550002");
    expect(normalizeSmsAddress("+1-773-555-0002")).toBe("+17735550002");
  });

  it("does not guess a country code for national numbers", () => {
    expect(normalizeSmsAddress("7735550002")).toBeNull();
    expect(normalizeSmsAddress("07735550002")).toBeNull();
    expect(normalizeSmsAddress("17735550002")).toBeNull();
  });

  it("fails closed for empty, non-numeric, and non-canonical values", () => {
    expect(normalizeSmsAddress("")).toBeNull();
    expect(normalizeSmsAddress("   ")).toBeNull();
    expect(normalizeSmsAddress("not-a-phone")).toBeNull();
    expect(normalizeSmsAddress("sales@acme.example")).toBeNull();
    expect(normalizeSmsAddress("+1")).toBeNull();
    expect(normalizeSmsAddress("+")).toBeNull();
  });

  it("does not call the WhatsApp or Email normalizers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/parse.ts"),
      "utf8"
    );
    expect(source).not.toContain("normalizeWhatsAppAddress");
    expect(source).not.toContain("normalizeEmailAddress");
    expect(source).not.toContain("adapters/whatsapp");
    expect(source).not.toContain("adapters/email");
    expect(normalizeSmsAddress("+17735550002")).toBe("+17735550002");
  });
});

describe("SMS inbound parse", () => {
  it("maps message.received SMS text to CanonicalInbound", () => {
    const parsed = parseSmsInbound(receivedEvent(), DEST);
    expect(parsed).toEqual({
      status: "inbound",
      event: {
        providerMessageId: MSG_ID,
        from: FROM,
        to: DEST,
        body: "Hello from SMS",
        occurredAt: "2026-08-28T13:00:00.000Z",
      },
    });
    if (parsed.status === "inbound") {
      expect(parsed.event).not.toHaveProperty("organizationId");
      expect(parsed.event).not.toHaveProperty("organization_id");
      expect(parsed.event).not.toHaveProperty("userId");
      expect(parsed.event).not.toHaveProperty("leadId");
      expect(parsed.event.providerMessageId).not.toBe(
        "webhook-event-id-must-not-be-used"
      );
    }
  });

  it("uses payload.received_at when data.occurred_at is absent", () => {
    const parsed = parseSmsInbound(
      receivedEvent({ occurred_at: "" }),
      DEST
    );
    expect(parsed.status).toBe("inbound");
    if (parsed.status === "inbound") {
      expect(parsed.event.occurredAt).toBe("2026-08-28T12:59:59.000Z");
    }
  });

  it("selects the tenant destination from to[]", () => {
    const parsed = parseSmsInbound(
      receivedEvent({
        payload: {
          to: [
            { phone_number: "+17735550999" },
            { phone_number: DEST },
          ],
        },
      }),
      DEST
    );
    expect(parsed.status).toBe("inbound");
    if (parsed.status === "inbound") {
      expect(parsed.event.to).toBe(DEST);
    }
  });

  it("fails closed when no recipient matches the trusted destination", () => {
    expect(() =>
      parseSmsInbound(
        receivedEvent({
          payload: { to: [{ phone_number: "+17735550999" }] },
        }),
        DEST
      )
    ).toThrow(AuthenticationError);
  });

  it("ignores sent, finalized, non-SMS, MMS, and empty text", () => {
    expect(
      parseSmsInbound(receivedEvent({ event_type: "message.sent" }))
    ).toEqual({ status: "ignored" });
    expect(
      parseSmsInbound(receivedEvent({ event_type: "message.finalized" }))
    ).toEqual({ status: "ignored" });
    expect(
      parseSmsInbound(receivedEvent({ event_type: "call.initiated" }))
    ).toEqual({ status: "ignored" });
    expect(
      parseSmsInbound(receivedEvent({ payload: { type: "MMS", text: "photo" } }))
    ).toEqual({ status: "ignored" });
    expect(
      parseSmsInbound(receivedEvent({ payload: { text: "   " } }))
    ).toEqual({ status: "ignored" });
    expect(
      parseSmsInbound(receivedEvent({ payload: { text: "" } }))
    ).toEqual({ status: "ignored" });
  });

  it("throws ValidationError on malformed received SMS metadata", () => {
    expect(() =>
      parseSmsInbound(receivedEvent({ payload: { id: "" } }))
    ).toThrow(ValidationError);
    expect(() =>
      parseSmsInbound(receivedEvent({ payload: { from: { phone_number: "" } } }))
    ).toThrow(ValidationError);
    expect(() =>
      parseSmsInbound(
        receivedEvent({ payload: { from: { phone_number: "7735550002" } } })
      )
    ).toThrow(ValidationError);
    expect(() =>
      parseSmsInbound(receivedEvent({ payload: { to: [] } }))
    ).toThrow(ValidationError);
  });
});
