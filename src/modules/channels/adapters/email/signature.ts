/**
 * Resend/Svix webhook verification. HMAC-SHA256 over the raw request body.
 * Does not use VG HMAC or WhatsApp X-Hub-Signature-256.
 */
import { createHmac } from "node:crypto";
import { signaturesMatch } from "@/modules/channels/hmac";
import {
  EMAIL_SVIX_MAX_SKEW_SECONDS,
  EMAIL_SVIX_SECRET_PREFIX,
  EMAIL_SVIX_SIGNATURE_VERSION_PREFIX,
} from "@/modules/channels/adapters/email/constants";

export function decodeSvixSecret(secret: string): Buffer | null {
  if (!secret.startsWith(EMAIL_SVIX_SECRET_PREFIX)) {
    return null;
  }
  const encoded = secret.slice(EMAIL_SVIX_SECRET_PREFIX.length);
  if (!encoded) {
    return null;
  }
  const key = Buffer.from(encoded, "base64");
  return key.length > 0 ? key : null;
}

export function signSvixWebhook(
  secretKey: Buffer,
  messageId: string,
  timestamp: string,
  rawBody: string
): string {
  const signedContent = `${messageId}.${timestamp}.${rawBody}`;
  return createHmac("sha256", secretKey).update(signedContent).digest("base64");
}

export function parseSvixSignatureHeader(header: string | null): string[] {
  const trimmed = header?.trim() ?? "";
  if (!trimmed) {
    return [];
  }
  const digests: string[] = [];
  for (const part of trimmed.split(/\s+/)) {
    if (!part.toLowerCase().startsWith(EMAIL_SVIX_SIGNATURE_VERSION_PREFIX)) {
      continue;
    }
    const digest = part.slice(EMAIL_SVIX_SIGNATURE_VERSION_PREFIX.length).trim();
    if (digest.length > 0) {
      digests.push(digest);
    }
  }
  return digests;
}

export function parseSvixTimestamp(
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
  const skewMs = EMAIL_SVIX_MAX_SKEW_SECONDS * 1000;
  if (Math.abs(nowMs - timestampMs) > skewMs) {
    return null;
  }
  return trimmed;
}

export function svixSignaturesMatch(
  expectedBase64: string,
  providedBase64: string
): boolean {
  return signaturesMatch(expectedBase64, providedBase64);
}

export function anySvixSignatureMatches(
  expectedBase64: string,
  provided: string[]
): boolean {
  for (const candidate of provided) {
    if (svixSignaturesMatch(expectedBase64, candidate)) {
      return true;
    }
  }
  return false;
}
