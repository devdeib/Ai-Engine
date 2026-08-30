/**
 * Resend Email channel configuration. Isolated from WhatsApp and test HMAC.
 * Live HTTP uses fetch against these URLs. No Resend SDK.
 */

export const EMAIL_SVIX_ID_HEADER = "svix-id";
export const EMAIL_SVIX_TIMESTAMP_HEADER = "svix-timestamp";
export const EMAIL_SVIX_SIGNATURE_HEADER = "svix-signature";
export const EMAIL_SVIX_SECRET_PREFIX = "whsec_";
export const EMAIL_SVIX_SIGNATURE_VERSION_PREFIX = "v1,";
export const EMAIL_SVIX_MAX_SKEW_SECONDS = 300;

export const EMAIL_RECEIVED_EVENT = "email.received";

export const RESEND_API_HOST = "https://api.resend.com";
export const EMAIL_IDEMPOTENCY_HEADER = "Idempotency-Key";
export const EMAIL_API_TIMEOUT_MS = 15_000;
export const EMAIL_SUBJECT_MAX_LENGTH = 78;

export function resendEmailsUrl(): string {
  return `${RESEND_API_HOST}/emails`;
}

export function resendReceivingEmailUrl(emailId: string): string {
  return `${RESEND_API_HOST}/emails/receiving/${encodeURIComponent(emailId)}`;
}
