/**
 * Telnyx SMS inbound adapter. Verifies Ed25519, then parses text-only SMS.
 * Does not persist CRM data, enqueue AI, or call Telnyx HTTP.
 */
import "server-only";
import { AuthenticationError } from "@/lib/errors";
import {
  SMS_SIGNATURE_HEADER,
  SMS_TIMESTAMP_HEADER,
} from "@/modules/channels/adapters/sms/constants";
import { parseSmsInboundBody } from "@/modules/channels/adapters/sms/parse";
import {
  decodeTelnyxPublicKey,
  decodeTelnyxSignature,
  parseTelnyxTimestamp,
  verifyTelnyxWebhook,
} from "@/modules/channels/adapters/sms/signature";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";
import type {
  ChannelInboundAdapter,
  ChannelInboundAdapterResult,
} from "@/modules/channels/adapters/types";

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

export function createSmsInboundAdapter(deps: {
  loadSecrets?: typeof loadChannelAccountSecrets;
} = {}): ChannelInboundAdapter {
  const loadSecrets = deps.loadSecrets ?? loadChannelAccountSecrets;

  return {
    async verifyAndParse(input): Promise<ChannelInboundAdapterResult> {
      if (input.account.channel !== "sms") {
        throw genericAuth();
      }

      const timestamp = parseTelnyxTimestamp(
        input.headers.get(SMS_TIMESTAMP_HEADER)
      );
      const signature = decodeTelnyxSignature(
        input.headers.get(SMS_SIGNATURE_HEADER)
      );
      if (!timestamp || !signature) {
        throw genericAuth();
      }

      const secrets = await loadSecrets(
        input.account.organization_id,
        input.account.id
      );
      if (!secrets?.webhookSecret) {
        throw genericAuth();
      }

      const publicKey = decodeTelnyxPublicKey(secrets.webhookSecret);
      if (!publicKey) {
        throw genericAuth();
      }

      if (
        !verifyTelnyxWebhook(publicKey, timestamp, input.rawBody, signature)
      ) {
        throw genericAuth();
      }

      return parseSmsInboundBody(
        input.rawBody,
        input.account.provider_destination_id
      );
    },
  };
}

export const smsInboundAdapter = createSmsInboundAdapter();
