/**
 * Telegram Bot API inbound adapter. Secret-token verification and parse only.
 * Does not persist CRM data, enqueue AI, or authorize tenants.
 */
import "server-only";
import { AuthenticationError } from "@/lib/errors";
import { parseTelegramInboundBody } from "@/modules/channels/adapters/telegram/parse";
import {
  readTelegramSecretTokenHeader,
  telegramSecretTokensMatch,
} from "@/modules/channels/adapters/telegram/signature";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";
import type {
  ChannelInboundAdapter,
  ChannelInboundAdapterResult,
} from "@/modules/channels/adapters/types";

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

export function createTelegramInboundAdapter(deps: {
  loadSecrets?: typeof loadChannelAccountSecrets;
} = {}): ChannelInboundAdapter {
  const loadSecrets = deps.loadSecrets ?? loadChannelAccountSecrets;

  return {
    async verifyAndParse(input): Promise<ChannelInboundAdapterResult> {
      if (input.account.channel !== "telegram") {
        throw genericAuth();
      }

      const provided = readTelegramSecretTokenHeader(input.headers);
      if (!provided) {
        throw genericAuth();
      }

      const secrets = await loadSecrets(
        input.account.organization_id,
        input.account.id
      );
      if (!secrets?.webhookSecret) {
        throw genericAuth();
      }

      if (!telegramSecretTokensMatch(secrets.webhookSecret, provided)) {
        throw genericAuth();
      }

      return parseTelegramInboundBody(
        input.rawBody,
        input.account.provider_destination_id
      );
    },
  };
}

export const telegramInboundAdapter = createTelegramInboundAdapter();
