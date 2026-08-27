/**
 * WhatsApp Cloud API configuration. Version is isolated here so it is not
 * scattered through adapters. Optional env; tests do not require it.
 */
const DEFAULT_GRAPH_API_VERSION = "v21.0";

export const WHATSAPP_GRAPH_API_HOST = "https://graph.facebook.com";
export const WHATSAPP_GRAPH_API_TIMEOUT_MS = 15_000;
export const WHATSAPP_SIGNATURE_HEADER = "x-hub-signature-256";
export const WHATSAPP_SIGNATURE_PREFIX = "sha256=";
export const WHATSAPP_HUB_MODE_SUBSCRIBE = "subscribe";
export const WHATSAPP_ACCESS_TOKEN_MAX_LENGTH = 4096;
export const WHATSAPP_VERIFY_TOKEN_MAX_LENGTH = 256;

export function whatsappGraphApiVersion(): string {
  const raw = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ?? "";
  return /^v\d+\.\d+$/.test(raw) ? raw : DEFAULT_GRAPH_API_VERSION;
}

export function whatsappMessagesUrl(phoneNumberId: string): string {
  return `${WHATSAPP_GRAPH_API_HOST}/${whatsappGraphApiVersion()}/${encodeURIComponent(phoneNumberId)}/messages`;
}
