import { describe, it, expect } from "vitest";
import { channelDeliveryIdempotencyKey } from "@/modules/channels/constants";
import { deliverLoopback } from "@/modules/channels/delivery/loopback";

const MSG_1 = "22222222-0000-4000-8000-0000000000bb";

describe("deliverLoopback", () => {
  it("uses the provider-neutral message id as the idempotency key and returns loopback provider identity", async () => {
    const key = channelDeliveryIdempotencyKey(MSG_1);
    const first = await deliverLoopback({ messageId: MSG_1, idempotencyKey: key });
    const retry = await deliverLoopback({ messageId: MSG_1, idempotencyKey: key });

    expect(key).toBe(MSG_1);
    expect(first.providerMessageId).toBe(`loopback:${MSG_1}`);
    expect(retry.providerMessageId).toBe(first.providerMessageId);
  });
});
