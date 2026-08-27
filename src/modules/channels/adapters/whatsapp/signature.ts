import { createHmac } from "node:crypto";
import { signaturesMatch } from "@/modules/channels/hmac";
import {
  WHATSAPP_SIGNATURE_PREFIX,
} from "@/modules/channels/adapters/whatsapp/constants";

export function signWhatsAppWebhook(appSecret: string, rawBody: string): string {
  return createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function parseWhatsAppSignatureHeader(
  header: string | null
): string | null {
  const trimmed = header?.trim() ?? "";
  if (!trimmed.toLowerCase().startsWith(WHATSAPP_SIGNATURE_PREFIX)) {
    return null;
  }
  const digest = trimmed.slice(WHATSAPP_SIGNATURE_PREFIX.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    return null;
  }
  return digest;
}

export function whatsappSignaturesMatch(
  expectedHex: string,
  providedHex: string
): boolean {
  return signaturesMatch(expectedHex.toLowerCase(), providedHex.toLowerCase());
}
