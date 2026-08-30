/**
 * Telnyx SMS delivery adapter. Text send only.
 * POST https://api.telnyx.com/v2/messages with Bearer provider_access_token.
 *
 * Official Telnyx POST /v2/messages does not document Idempotency-Key
 * (unlike Telnyx email_messages). This adapter does not send that header.
 * The generic worker still supplies messageId as idempotencyKey.
 * Delivery remains at-least-once; do not claim exactly-once.
 */
import "server-only";
import {
  SMS_API_TIMEOUT_MS,
  telnyxMessagesUrl,
} from "@/modules/channels/adapters/sms/constants";
import {
  classifySmsHttpError,
  classifySmsNetworkError,
} from "@/modules/channels/adapters/sms/errors";
import { loadSmsDeliveryCredentials } from "@/modules/channels/secrets";
import type {
  ChannelDeliveryAdapter,
  ChannelDeliverySendInput,
  ChannelDeliverySendResult,
} from "@/modules/channels/adapters/types";

type FetchFn = typeof fetch;

function readProviderMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

export function createSmsDeliveryAdapter(deps: {
  fetchImpl?: FetchFn;
  loadCredentials?: typeof loadSmsDeliveryCredentials;
} = {}): ChannelDeliveryAdapter {
  const loadCredentials = deps.loadCredentials ?? loadSmsDeliveryCredentials;

  return {
    async send(input: ChannelDeliverySendInput): Promise<ChannelDeliverySendResult> {
      void input.idempotencyKey;

      const credentials = await loadCredentials(
        input.organizationId,
        input.channelAccountId
      );
      if (!credentials) {
        return {
          ok: false,
          errorCode: "INVALID_ACCESS_TOKEN",
          retryable: false,
        };
      }

      const fetchFn = deps.fetchImpl ?? globalThis.fetch;
      const url = telnyxMessagesUrl();
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: credentials.destination,
            to: input.destination,
            text: input.body,
          }),
          signal: AbortSignal.timeout(SMS_API_TIMEOUT_MS),
        });
      } catch (error) {
        const classified = classifySmsNetworkError(error);
        return {
          ok: false,
          errorCode: classified.errorCode,
          retryable: classified.retryable,
        };
      }

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = null;
      }

      if (!response.ok) {
        const classified = classifySmsHttpError(response.status, parsed);
        return {
          ok: false,
          errorCode: classified.errorCode,
          retryable: classified.retryable,
        };
      }

      const providerMessageId = readProviderMessageId(parsed);
      if (!providerMessageId) {
        return {
          ok: false,
          errorCode: "MALFORMED_REQUEST",
          retryable: false,
        };
      }

      return { ok: true, providerMessageId };
    },
  };
}

export const smsDeliveryAdapter = createSmsDeliveryAdapter();
