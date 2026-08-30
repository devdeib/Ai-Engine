/**
 * Resend Email inbound adapter. Verifies Svix, parses metadata, fetches text.
 * Does not persist CRM data, enqueue AI, or authorize tenants.
 * Receiving API belongs here. Generic ingest never sees the access token.
 */
import "server-only";
import { AuthenticationError } from "@/lib/errors";
import {
  EMAIL_API_TIMEOUT_MS,
  EMAIL_SVIX_ID_HEADER,
  EMAIL_SVIX_SIGNATURE_HEADER,
  EMAIL_SVIX_TIMESTAMP_HEADER,
  resendReceivingEmailUrl,
} from "@/modules/channels/adapters/email/constants";
import {
  normalizeEmailAddress,
  parseEmailReceivedMetadata,
  parseEmailWebhookJson,
  readReceivingPlainText,
  toCanonicalEmailInbound,
} from "@/modules/channels/adapters/email/parse";
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

type FetchFn = typeof fetch;

const IGNORED: ChannelInboundAdapterResult = { status: "ignored" };

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

function receivingLoadFailed(): Error {
  return new Error("Failed to load received email");
}

export function createEmailInboundAdapter(deps: {
  fetchImpl?: FetchFn;
  loadSecrets?: typeof loadChannelAccountSecrets;
} = {}): ChannelInboundAdapter {
  const loadSecrets = deps.loadSecrets ?? loadChannelAccountSecrets;

  return {
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

      const secrets = await loadSecrets(
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

      const parsed = parseEmailReceivedMetadata(
        parseEmailWebhookJson(input.rawBody)
      );
      if (parsed.status === "ignored") {
        return IGNORED;
      }

      const tenantDestination = normalizeEmailAddress(
        input.account.provider_destination_id
      );
      if (
        !tenantDestination ||
        !parsed.metadata.recipients.includes(tenantDestination)
      ) {
        throw genericAuth();
      }

      const accessToken = secrets.providerAccessToken?.trim() ?? "";
      if (!accessToken) {
        throw genericAuth();
      }

      const fetchFn = deps.fetchImpl ?? globalThis.fetch;
      const url = resendReceivingEmailUrl(parsed.metadata.emailId);
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: AbortSignal.timeout(EMAIL_API_TIMEOUT_MS),
        });
      } catch {
        throw receivingLoadFailed();
      }

      if (response.status === 401 || response.status === 403) {
        throw genericAuth();
      }
      if (!response.ok) {
        throw receivingLoadFailed();
      }

      let receiving: unknown;
      try {
        receiving = await response.json();
      } catch {
        receiving = null;
      }

      // No usable plain text (HTML-only, empty, or unreadable): ignore.
      // Do not persist HTML, invent a body, or enqueue AI.
      const text = readReceivingPlainText(receiving);
      if (!text) {
        return IGNORED;
      }

      return toCanonicalEmailInbound({
        emailId: parsed.metadata.emailId,
        from: parsed.metadata.from,
        recipients: parsed.metadata.recipients,
        text,
        occurredAt: parsed.metadata.occurredAt,
        destination: input.account.provider_destination_id,
      });
    },
  };
}

export const emailInboundAdapter = createEmailInboundAdapter();
