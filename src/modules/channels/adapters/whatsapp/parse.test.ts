import { describe, it, expect } from "vitest";
import { ValidationError } from "@/lib/errors";
import {
  normalizeWhatsAppAddress,
  parseWhatsAppInbound,
  parseWhatsAppInboundBody,
} from "@/modules/channels/adapters/whatsapp/parse";

const PHONE_NUMBER_ID = "123456789012345";
const SENDER = "9745550001";
const WAMID = "wamid.HBgNOTE3NDU1NTAwMDE";

function textPayload(overrides: {
  id?: string;
  from?: string;
  body?: string;
  type?: string;
  phoneNumberId?: string;
  timestamp?: string;
} = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: overrides.phoneNumberId ?? PHONE_NUMBER_ID,
              },
              messages: [
                {
                  from: overrides.from ?? SENDER,
                  id: overrides.id ?? WAMID,
                  timestamp: overrides.timestamp ?? "1710000000",
                  type: overrides.type ?? "text",
                  text:
                    overrides.body === undefined && overrides.type && overrides.type !== "text"
                      ? undefined
                      : { body: overrides.body ?? "Hello from WhatsApp" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(status: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              statuses: [
                {
                  id: WAMID,
                  status,
                  timestamp: "1710000000",
                  recipient_id: SENDER,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function mediaPayload(type: string) {
  return textPayload({ type, body: undefined });
}

describe("parseWhatsAppInbound", () => {
  it("parses a valid text message into CanonicalInbound", () => {
    const result = parseWhatsAppInbound(textPayload());
    expect(result).toEqual({
      status: "inbound",
      event: {
        providerMessageId: WAMID,
        from: SENDER,
        to: PHONE_NUMBER_ID,
        body: "Hello from WhatsApp",
        occurredAt: "2024-03-09T16:00:00.000Z",
      },
    });
  });

  it("normalizes sender addresses inside the WhatsApp boundary", () => {
    expect(normalizeWhatsAppAddress("+974 555 0001")).toBe("9745550001");
    const result = parseWhatsAppInbound(textPayload({ from: "+9745550001" }));
    expect(result.status).toBe("inbound");
    if (result.status === "inbound") {
      expect(result.event.from).toBe("9745550001");
    }
  });

  it("rejects malformed JSON", () => {
    expect(() => parseWhatsAppInboundBody("{not-json")).toThrow(ValidationError);
  });

  it("rejects a text message missing the provider message id", () => {
    expect(() => parseWhatsAppInbound(textPayload({ id: "" }))).toThrow(
      ValidationError
    );
  });

  it("rejects a text message missing the sender", () => {
    expect(() => parseWhatsAppInbound(textPayload({ from: "" }))).toThrow(
      ValidationError
    );
  });

  it("rejects a text message missing the text body", () => {
    expect(() => parseWhatsAppInbound(textPayload({ body: "" }))).toThrow(
      ValidationError
    );
  });

  it("ignores delivery status events", () => {
    expect(parseWhatsAppInbound(statusPayload("delivered"))).toEqual({
      status: "ignored",
    });
  });

  it("ignores read events", () => {
    expect(parseWhatsAppInbound(statusPayload("read"))).toEqual({
      status: "ignored",
    });
  });

  it("ignores sent status events", () => {
    expect(parseWhatsAppInbound(statusPayload("sent"))).toEqual({
      status: "ignored",
    });
  });

  it("ignores non-text and media messages", () => {
    expect(parseWhatsAppInbound(mediaPayload("image"))).toEqual({ status: "ignored" });
    expect(parseWhatsAppInbound(mediaPayload("audio"))).toEqual({ status: "ignored" });
    expect(parseWhatsAppInbound(mediaPayload("video"))).toEqual({ status: "ignored" });
    expect(parseWhatsAppInbound(mediaPayload("document"))).toEqual({
      status: "ignored",
    });
    expect(parseWhatsAppInbound(mediaPayload("sticker"))).toEqual({
      status: "ignored",
    });
    expect(parseWhatsAppInbound(mediaPayload("reaction"))).toEqual({
      status: "ignored",
    });
  });

  it("ignores unrelated provider events", () => {
    expect(parseWhatsAppInbound({ object: "user" })).toEqual({ status: "ignored" });
    expect(parseWhatsAppInbound({ foo: "bar" })).toEqual({ status: "ignored" });
  });
});
