/**
 * Telnyx Ed25519 webhook verification.
 * Signed content is `{timestamp}|{rawBody}` over the exact raw request body.
 * Does not use VG HMAC, WhatsApp X-Hub-Signature-256, or Resend/Svix.
 */
import { createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import {
  SMS_ED25519_PUBLIC_KEY_BYTES,
  SMS_ED25519_SIGNATURE_BYTES,
  SMS_MAX_SKEW_SECONDS,
} from "@/modules/channels/adapters/sms/constants";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Decode a Telnyx Ed25519 public key stored in webhook_secret.
 * Expected: standard base64 of 32 raw bytes.
 */
export function decodeTelnyxPublicKey(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) {
    return null;
  }
  const key = Buffer.from(trimmed, "base64");
  return key.length === SMS_ED25519_PUBLIC_KEY_BYTES ? key : null;
}

export function decodeTelnyxSignature(header: string | null): Buffer | null {
  const trimmed = header?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const signature = Buffer.from(trimmed, "base64");
  return signature.length === SMS_ED25519_SIGNATURE_BYTES ? signature : null;
}

export function telnyxSignedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}|${rawBody}`;
}

export function parseTelnyxTimestamp(
  value: string | null,
  nowMs: number = Date.now()
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!/^\d{10}$/.test(trimmed)) {
    return null;
  }
  const timestampMs = Number(trimmed) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return null;
  }
  const skewMs = SMS_MAX_SKEW_SECONDS * 1000;
  if (Math.abs(nowMs - timestampMs) > skewMs) {
    return null;
  }
  return trimmed;
}

function ed25519PublicKeyObject(rawPublicKey: Buffer): KeyObject | null {
  try {
    return createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }
}

export function verifyTelnyxWebhook(
  rawPublicKey: Buffer,
  timestamp: string,
  rawBody: string,
  signature: Buffer
): boolean {
  const key = ed25519PublicKeyObject(rawPublicKey);
  if (!key) {
    return false;
  }
  try {
    return verify(
      null,
      Buffer.from(telnyxSignedPayload(timestamp, rawBody), "utf8"),
      key,
      signature
    );
  } catch {
    return false;
  }
}

export function signTelnyxWebhook(
  privateKey: KeyObject,
  timestamp: string,
  rawBody: string
): string {
  const signature = sign(
    null,
    Buffer.from(telnyxSignedPayload(timestamp, rawBody), "utf8"),
    privateKey
  );
  return signature.toString("base64");
}

export function telnyxPublicKeyToBase64(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" });
  const buffer = Buffer.isBuffer(der) ? der : Buffer.from(der);
  return buffer
    .subarray(buffer.length - SMS_ED25519_PUBLIC_KEY_BYTES)
    .toString("base64");
}
