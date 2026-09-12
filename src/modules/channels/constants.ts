export const CHANNEL_WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1000;

export const CHANNEL_WEBHOOK_TIMESTAMP_HEADER = "x-vg-timestamp";
export const CHANNEL_WEBHOOK_SIGNATURE_HEADER = "x-vg-signature";

export const CHANNEL_SECRET_BYTES = 32;

export const CHANNEL_DELIVERY_MAX_ATTEMPTS = 3;
export const CHANNEL_DELIVERY_LEASE_SECONDS = 90;
export const CHANNEL_DELIVERY_CLAIM_LIMIT = 5;
export const CHANNEL_DELIVERY_CRON_CLAIM_LIMIT = CHANNEL_DELIVERY_CLAIM_LIMIT;

export const CHANNEL_STUB_LEAD_FIRST_NAME = "Unknown";
export const CHANNEL_STUB_LEAD_LAST_NAME = "Customer";

export function isExternalChannel(channel: string): boolean {
  return channel !== "in_app";
}

export function channelDeliveryRetryDelaySeconds(attemptCount: number): number {
  const capped = Math.min(Math.max(attemptCount, 1), 6);
  return 5 * capped;
}

/**
 * Stable outbound idempotency key. Always the internal message id.
 * Adapters may map this onto provider-specific fields. Loopback still
 * returns loopback:${messageId} as provider_message_id.
 */
export function channelDeliveryIdempotencyKey(messageId: string): string {
  return messageId;
}
