import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseWhatsAppSignatureHeader,
  signWhatsAppWebhook,
  whatsappSignaturesMatch,
} from "@/modules/channels/adapters/whatsapp/signature";

const APP_SECRET = "a".repeat(32);
const RAW_BODY = '{"object":"whatsapp_business_account"}';

describe("WhatsApp webhook signature", () => {
  it("computes HMAC-SHA256 of the raw body", () => {
    const expected = createHmac("sha256", APP_SECRET).update(RAW_BODY).digest("hex");
    expect(signWhatsAppWebhook(APP_SECRET, RAW_BODY)).toBe(expected);
  });

  it("accepts a valid X-Hub-Signature-256 header", () => {
    const digest = signWhatsAppWebhook(APP_SECRET, RAW_BODY);
    expect(parseWhatsAppSignatureHeader(`sha256=${digest}`)).toBe(digest);
  });

  it("rejects a missing signature", () => {
    expect(parseWhatsAppSignatureHeader(null)).toBeNull();
    expect(parseWhatsAppSignatureHeader("")).toBeNull();
  });

  it("rejects a malformed signature", () => {
    expect(parseWhatsAppSignatureHeader("sha1=abc")).toBeNull();
    expect(parseWhatsAppSignatureHeader("sha256=")).toBeNull();
    expect(parseWhatsAppSignatureHeader("sha256=zzzz")).toBeNull();
    expect(parseWhatsAppSignatureHeader("sha256=abcd")).toBeNull();
    expect(parseWhatsAppSignatureHeader(signWhatsAppWebhook(APP_SECRET, RAW_BODY))).toBeNull();
  });

  it("compares signatures in constant time via equal-length buffers", () => {
    const left = signWhatsAppWebhook(APP_SECRET, RAW_BODY);
    const right = signWhatsAppWebhook("b".repeat(32), RAW_BODY);
    expect(whatsappSignaturesMatch(left, left)).toBe(true);
    expect(whatsappSignaturesMatch(left, right)).toBe(false);
  });

  it("verifies the raw body, not a parsed object", () => {
    const signed = signWhatsAppWebhook(APP_SECRET, RAW_BODY);
    const tampered = RAW_BODY.replace("whatsapp", "other");
    const expectedForTampered = signWhatsAppWebhook(APP_SECRET, tampered);
    expect(whatsappSignaturesMatch(signed, expectedForTampered)).toBe(false);
  });
});
