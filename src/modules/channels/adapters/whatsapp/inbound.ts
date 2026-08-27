/**
 * WhatsApp Cloud API inbound adapter. Provider verification and parse only.
 * Does not persist CRM data, enqueue AI, or authorize tenants.
 */
import "server-only";
import { AuthenticationError } from "@/lib/errors";
import { WHATSAPP_SIGNATURE_HEADER } from "@/modules/channels/adapters/whatsapp/constants";
import { parseWhatsAppInboundBody } from "@/modules/channels/adapters/whatsapp/parse";
import {
  parseWhatsAppSignatureHeader,
  signWhatsAppWebhook,
  whatsappSignaturesMatch,
} from "@/modules/channels/adapters/whatsapp/signature";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";
import type {
  ChannelInboundAdapter,
  ChannelInboundAdapterResult,
} from "@/modules/channels/adapters/types";

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

export const whatsappInboundAdapter: ChannelInboundAdapter = {
  async verifyAndParse(input): Promise<ChannelInboundAdapterResult> {
    if (input.account.channel !== "whatsapp") {
      throw genericAuth();
    }

    const provided = parseWhatsAppSignatureHeader(
      input.headers.get(WHATSAPP_SIGNATURE_HEADER)
    );
    if (!provided) {
      throw genericAuth();
    }

    const secrets = await loadChannelAccountSecrets(
      input.account.organization_id,
      input.account.id
    );
    if (!secrets?.webhookSecret) {
      throw genericAuth();
    }

    const expected = signWhatsAppWebhook(secrets.webhookSecret, input.rawBody);
    if (!whatsappSignaturesMatch(expected, provided)) {
      throw genericAuth();
    }

    return parseWhatsAppInboundBody(input.rawBody);
  },
};
