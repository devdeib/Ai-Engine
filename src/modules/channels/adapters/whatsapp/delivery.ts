/**
 * WhatsApp Cloud API delivery adapter. Text send only.
 * Does not persist CRM rows, enqueue jobs, or call AI.
 *
 * WhatsApp Cloud API has no provider-side idempotency for this endpoint.
 * The stable key is still received on every retry. Provider acceptance
 * followed by a lost response may result in a duplicate send.
 */
import "server-only";
import {
  WHATSAPP_GRAPH_API_TIMEOUT_MS,
  whatsappMessagesUrl,
} from "@/modules/channels/adapters/whatsapp/constants";
import {
  classifyWhatsAppHttpError,
  classifyWhatsAppNetworkError,
} from "@/modules/channels/adapters/whatsapp/errors";
import { loadWhatsAppDeliveryCredentials } from "@/modules/channels/secrets";
import type {
  ChannelDeliveryAdapter,
  ChannelDeliverySendInput,
  ChannelDeliverySendResult,
} from "@/modules/channels/adapters/types";

type FetchFn = typeof fetch;

function readProviderMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const first = messages[0];
  if (typeof first !== "object" || first === null) return null;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" && id.trim().length > 0 ? id.trim() : null;
}

export function createWhatsAppDeliveryAdapter(deps: {
  fetchImpl?: FetchFn;
  loadCredentials?: typeof loadWhatsAppDeliveryCredentials;
} = {}): ChannelDeliveryAdapter {
  const loadCredentials =
    deps.loadCredentials ?? loadWhatsAppDeliveryCredentials;

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
      const url = whatsappMessagesUrl(credentials.phoneNumberId);
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: input.destination,
            type: "text",
            text: {
              preview_url: false,
              body: input.body,
            },
          }),
          signal: AbortSignal.timeout(WHATSAPP_GRAPH_API_TIMEOUT_MS),
        });
      } catch (error) {
        const classified = classifyWhatsAppNetworkError(error);
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
        const classified = classifyWhatsAppHttpError(response.status, parsed);
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

export const whatsappDeliveryAdapter = createWhatsAppDeliveryAdapter();
