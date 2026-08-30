/**
 * Telnyx SMS channel configuration. Isolated from WhatsApp HMAC and Email Svix.
 * Live HTTP uses fetch against these URLs. No Telnyx SDK. No env-var tenant credentials.
 *
 * Official POST /v2/messages OpenAPI does not document Idempotency-Key
 * (unlike Telnyx email_messages). Do not send that header. Delivery remains
 * at-least-once via the generic worker; do not claim exactly-once.
 */

export const SMS_SIGNATURE_HEADER = "telnyx-signature-ed25519";
export const SMS_TIMESTAMP_HEADER = "telnyx-timestamp";
export const SMS_MAX_SKEW_SECONDS = 300;
export const SMS_ED25519_PUBLIC_KEY_BYTES = 32;
export const SMS_ED25519_SIGNATURE_BYTES = 64;

export const SMS_RECEIVED_EVENT = "message.received";
export const SMS_PAYLOAD_TYPE = "SMS";

export const TELNYX_API_HOST = "https://api.telnyx.com";
export const SMS_API_TIMEOUT_MS = 15_000;

export function telnyxMessagesUrl(): string {
  return `${TELNYX_API_HOST}/v2/messages`;
}
