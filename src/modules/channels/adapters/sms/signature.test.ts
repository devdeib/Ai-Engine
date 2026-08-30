import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeTelnyxPublicKey,
  decodeTelnyxSignature,
  parseTelnyxTimestamp,
  signTelnyxWebhook,
  telnyxPublicKeyToBase64,
  telnyxSignedPayload,
  verifyTelnyxWebhook,
} from "@/modules/channels/adapters/sms/signature";
import { SMS_MAX_SKEW_SECONDS } from "@/modules/channels/adapters/sms/constants";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = telnyxPublicKeyToBase64(publicKey);

describe("Telnyx SMS Ed25519 verification", () => {
  it("decodes a 32-byte Ed25519 public key from base64", () => {
    const decoded = decodeTelnyxPublicKey(PUBLIC_KEY);
    expect(decoded).not.toBeNull();
    expect(decoded?.length).toBe(32);
  });

  it("rejects empty or wrong-length keys", () => {
    expect(decodeTelnyxPublicKey("")).toBeNull();
    expect(decodeTelnyxPublicKey("abc")).toBeNull();
    expect(decodeTelnyxPublicKey(Buffer.alloc(31, 1).toString("base64"))).toBeNull();
  });

  it("accepts unix timestamps within skew and rejects stale values", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(parseTelnyxTimestamp(String(nowSec))).toBe(String(nowSec));
    expect(
      parseTelnyxTimestamp(
        String(nowSec - SMS_MAX_SKEW_SECONDS - 1),
        nowSec * 1000
      )
    ).toBeNull();
    expect(parseTelnyxTimestamp("not-a-timestamp")).toBeNull();
  });

  it("verifies signatures over timestamp|rawBody and rejects reformatted JSON", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"data":{"event_type":"message.received"}}';
    const signature = decodeTelnyxSignature(
      signTelnyxWebhook(privateKey, timestamp, rawBody)
    );
    const key = decodeTelnyxPublicKey(PUBLIC_KEY);
    expect(signature).not.toBeNull();
    expect(key).not.toBeNull();
    expect(verifyTelnyxWebhook(key!, timestamp, rawBody, signature!)).toBe(true);
    expect(
      verifyTelnyxWebhook(
        key!,
        timestamp,
        JSON.stringify(JSON.parse(rawBody), null, 2),
        signature!
      )
    ).toBe(false);
    expect(telnyxSignedPayload(timestamp, rawBody)).toBe(`${timestamp}|${rawBody}`);
  });

  it("uses node:crypto Ed25519 and does not import HMAC/Svix/WhatsApp verifiers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/signature.ts"),
      "utf8"
    );
    expect(source).toContain('from "node:crypto"');
    expect(source).toContain("verify(");
    expect(source).not.toContain("createHmac");
    expect(source).not.toContain("signWhatsAppWebhook");
    expect(source).not.toContain("signSvixWebhook");
    expect(source).not.toContain("signChannelWebhook");
  });
});
