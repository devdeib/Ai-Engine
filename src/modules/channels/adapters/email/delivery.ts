/**
 * Resend Email delivery adapter. Text send only.
 * 5.3A does not perform live HTTP. Missing credentials fail closed.
 * 5.3B will POST https://api.resend.com/emails with Idempotency-Key = messageId.
 *
 * Resend supports provider-side Idempotency-Key. Delivery remains at-least-once;
 * do not claim exactly-once.
 */
import "server-only";
import { EMAIL_SEND_NOT_IMPLEMENTED } from "@/modules/channels/adapters/email/constants";
import { loadEmailDeliveryCredentials } from "@/modules/channels/secrets";
import type {
  ChannelDeliveryAdapter,
  ChannelDeliverySendInput,
  ChannelDeliverySendResult,
} from "@/modules/channels/adapters/types";

export function createEmailDeliveryAdapter(deps: {
  loadCredentials?: typeof loadEmailDeliveryCredentials;
} = {}): ChannelDeliveryAdapter {
  const loadCredentials = deps.loadCredentials ?? loadEmailDeliveryCredentials;

  return {
    async send(input: ChannelDeliverySendInput): Promise<ChannelDeliverySendResult> {
      void input.idempotencyKey;
      void input.destination;
      void input.body;

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

      return {
        ok: false,
        errorCode: EMAIL_SEND_NOT_IMPLEMENTED,
        retryable: false,
      };
    },
  };
}

export const emailDeliveryAdapter = createEmailDeliveryAdapter();
