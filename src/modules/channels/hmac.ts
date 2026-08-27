import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { CHANNEL_SECRET_BYTES } from "@/modules/channels/constants";

export function generateChannelWebhookSecret(): string {
  return randomBytes(CHANNEL_SECRET_BYTES).toString("hex");
}

export function channelWebhookSigningPayload(
  timestamp: string,
  rawBody: string
): string {
  return `${timestamp}.${rawBody}`;
}

export function signChannelWebhook(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac("sha256", secret)
    .update(channelWebhookSigningPayload(timestamp, rawBody))
    .digest("hex");
}

export function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeExternalAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function parseWebhookTimestamp(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{10,13}$/.test(trimmed)) {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return trimmed.length <= 10 ? numeric * 1000 : numeric;
}

export function isWebhookTimestampFresh(
  timestampMs: number,
  nowMs: number,
  maxSkewMs: number
): boolean {
  return Math.abs(nowMs - timestampMs) <= maxSkewMs;
}
