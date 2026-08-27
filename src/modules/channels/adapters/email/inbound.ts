/**
 * Resend Email inbound adapter. Signature verification and parse only.
 * Does not persist CRM data, enqueue AI, or authorize tenants.
 * 5.3A does not call the Receiving API; metadata-only events are ignored.
 */
import "server-only";
import { AuthenticationError } from "@/lib/errors";
import {
  EMAIL_SVIX_ID_HEADER,
  EMAIL_SVIX_SIGNATURE_HEADER,
  EMAIL_SVIX_TIMESTAMP_HEADER,
} from "@/modules/channels/adapters/email/constants";
import { parseEmailInboundBody } from "@/modules/channels/adapters/email/parse";
import {
  anySvixSignatureMatches,
  decodeSvixSecret,
  parseSvixSignatureHeader,
  parseSvixTimestamp,
  signSvixWebhook,
} from "@/modules/channels/adapters/email/signature";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";
import type {
  ChannelInboundAdapter,
  ChannelInboundAdapterResult,
} from "@/modules/channels/adapters/types";

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

export const emailInboundAdapter: ChannelInboundAdapter = {
  async verifyAndParse(input): Promise<ChannelInboundAdapterResult> {
    if (input.account.channel !== "email") {
      throw genericAuth();
    }

    const messageId = input.headers.get(EMAIL_SVIX_ID_HEADER)?.trim() ?? "";
    const timestamp = parseSvixTimestamp(
      input.headers.get(EMAIL_SVIX_TIMESTAMP_HEADER)
    );
    const signatures = parseSvixSignatureHeader(
      input.headers.get(EMAIL_SVIX_SIGNATURE_HEADER)
    );
    if (!messageId || !timestamp || signatures.length === 0) {
      throw genericAuth();
    }

    const secrets = await loadChannelAccountSecrets(
      input.account.organization_id,
      input.account.id
    );
    if (!secrets?.webhookSecret) {
      throw genericAuth();
    }

    const secretKey = decodeSvixSecret(secrets.webhookSecret);
    if (!secretKey) {
      throw genericAuth();
    }

    const expected = signSvixWebhook(
      secretKey,
      messageId,
      timestamp,
      input.rawBody
    );
    if (!anySvixSignatureMatches(expected, signatures)) {
      throw genericAuth();
    }

    return parseEmailInboundBody(
      input.rawBody,
      input.account.provider_destination_id
    );
  },
};
