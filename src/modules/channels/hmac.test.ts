import { describe, it, expect } from "vitest";
import {
  isWebhookTimestampFresh,
  normalizeExternalAddress,
  parseWebhookTimestamp,
  signChannelWebhook,
  signaturesMatch,
} from "@/modules/channels/hmac";
import { CHANNEL_WEBHOOK_MAX_SKEW_MS } from "@/modules/channels/constants";

describe("channel HMAC helpers", () => {
  const secret = "a".repeat(32);
  const rawBody = '{"providerMessageId":"m1","from":"a","to":"b","body":"hi"}';

  it("accepts a matching HMAC-SHA256 signature", () => {
    const timestamp = "1710000000";
    const signature = signChannelWebhook(secret, timestamp, rawBody);
    expect(signaturesMatch(signature, signChannelWebhook(secret, timestamp, rawBody))).toBe(
      true
    );
  });

  it("rejects a signature from a different secret", () => {
    const timestamp = "1710000000";
    const left = signChannelWebhook(secret, timestamp, rawBody);
    const right = signChannelWebhook("b".repeat(32), timestamp, rawBody);
    expect(signaturesMatch(left, right)).toBe(false);
  });

  it("rejects signatures of different lengths without throwing", () => {
    expect(signaturesMatch("ab", "abcd")).toBe(false);
  });

  it("rejects timestamps outside the 5-minute window", () => {
    const now = 1_710_000_000_000;
    expect(
      isWebhookTimestampFresh(now - CHANNEL_WEBHOOK_MAX_SKEW_MS - 1, now, CHANNEL_WEBHOOK_MAX_SKEW_MS)
    ).toBe(false);
    expect(
      isWebhookTimestampFresh(now + CHANNEL_WEBHOOK_MAX_SKEW_MS + 1, now, CHANNEL_WEBHOOK_MAX_SKEW_MS)
    ).toBe(false);
    expect(isWebhookTimestampFresh(now, now, CHANNEL_WEBHOOK_MAX_SKEW_MS)).toBe(true);
  });

  it("parses unix seconds and milliseconds", () => {
    expect(parseWebhookTimestamp("1710000000")).toBe(1_710_000_000_000);
    expect(parseWebhookTimestamp("1710000000000")).toBe(1_710_000_000_000);
    expect(parseWebhookTimestamp("not-a-time")).toBeNull();
  });

  it("normalizes external addresses without accepting identity from payload shape", () => {
    expect(normalizeExternalAddress("  +974555  ")).toBe("+974555");
    expect(normalizeExternalAddress("User@Example.COM")).toBe("user@example.com");
  });
});
