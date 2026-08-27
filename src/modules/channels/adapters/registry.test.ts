import { describe, it, expect } from "vitest";
import { isExternalChannel } from "@/modules/channels/constants";
import {
  getDeliveryAdapter,
  getInboundAdapter,
  UnsupportedChannelError,
} from "@/modules/channels/adapters/registry";
import { emailDeliveryAdapter } from "@/modules/channels/adapters/email/delivery";
import { emailInboundAdapter } from "@/modules/channels/adapters/email/inbound";
import { testDeliveryAdapter } from "@/modules/channels/adapters/test-delivery";
import { testInboundAdapter } from "@/modules/channels/adapters/test-inbound";
import { whatsappDeliveryAdapter } from "@/modules/channels/adapters/whatsapp/delivery";
import { whatsappInboundAdapter } from "@/modules/channels/adapters/whatsapp/inbound";

describe("channel adapter registry", () => {
  it("resolves the test channel to the test inbound adapter", () => {
    expect(getInboundAdapter("test")).toBe(testInboundAdapter);
  });

  it("resolves the test channel to the test delivery adapter", () => {
    expect(getDeliveryAdapter("test")).toBe(testDeliveryAdapter);
  });

  it("resolves WhatsApp to the WhatsApp adapters without falling back to test", () => {
    expect(getInboundAdapter("whatsapp")).toBe(whatsappInboundAdapter);
    expect(getDeliveryAdapter("whatsapp")).toBe(whatsappDeliveryAdapter);
    expect(getInboundAdapter("whatsapp")).not.toBe(testInboundAdapter);
    expect(getDeliveryAdapter("whatsapp")).not.toBe(testDeliveryAdapter);
  });

  it("resolves Email to the Email adapters without falling back to test or WhatsApp", () => {
    expect(getInboundAdapter("email")).toBe(emailInboundAdapter);
    expect(getDeliveryAdapter("email")).toBe(emailDeliveryAdapter);
    expect(getInboundAdapter("email")).not.toBe(testInboundAdapter);
    expect(getDeliveryAdapter("email")).not.toBe(testDeliveryAdapter);
    expect(getInboundAdapter("email")).not.toBe(whatsappInboundAdapter);
    expect(getDeliveryAdapter("email")).not.toBe(whatsappDeliveryAdapter);
  });

  it("fails safely for an unsupported inbound channel without falling back to test", () => {
    expect(() => getInboundAdapter("in_app")).toThrow(UnsupportedChannelError);
    expect(() => getInboundAdapter("unknown")).toThrow(UnsupportedChannelError);
    expect(getInboundAdapter("test")).toBe(testInboundAdapter);
  });

  it("fails safely for an unsupported delivery channel without falling back to test", () => {
    expect(() => getDeliveryAdapter("in_app")).toThrow(UnsupportedChannelError);
    expect(() => getDeliveryAdapter("unknown")).toThrow(UnsupportedChannelError);
    expect(getDeliveryAdapter("test")).toBe(testDeliveryAdapter);
  });

  it("treats every non-in_app channel as external", () => {
    expect(isExternalChannel("in_app")).toBe(false);
    expect(isExternalChannel("test")).toBe(true);
    expect(isExternalChannel("whatsapp")).toBe(true);
    expect(isExternalChannel("email")).toBe(true);
  });
});
