/**
 * Test-channel delivery adapter. Loopback only; no outbound URL or SDK.
 */
import { deliverLoopback } from "@/modules/channels/delivery/loopback";
import type {
  ChannelDeliveryAdapter,
  ChannelDeliverySendResult,
} from "@/modules/channels/adapters/types";

export const testDeliveryAdapter: ChannelDeliveryAdapter = {
  async send(input): Promise<ChannelDeliverySendResult> {
    const delivered = await deliverLoopback({
      messageId: input.messageId,
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true, providerMessageId: delivered.providerMessageId };
  },
};
