import { describe, it, expect } from "vitest";
import { channelDeliveryIdempotencyKey } from "@/modules/channels/constants";
import { testDeliveryAdapter } from "@/modules/channels/adapters/test-delivery";

const MSG_1 = "22222222-0000-4000-8000-0000000000bb";

describe("testDeliveryAdapter", () => {
  it("succeeds and records loopback provider identity from the internal message id", async () => {
    const idempotencyKey = channelDeliveryIdempotencyKey(MSG_1);
    expect(idempotencyKey).toBe(MSG_1);

    const first = await testDeliveryAdapter.send({
      organizationId: "aaaaaaaa-0000-0000-0000-000000000001",
      channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channelIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      messageId: MSG_1,
      destination: "+9745550001",
      body: "Hello",
      idempotencyKey,
    });
    const retry = await testDeliveryAdapter.send({
      organizationId: "aaaaaaaa-0000-0000-0000-000000000001",
      channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channelIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      messageId: MSG_1,
      destination: "+9745550001",
      body: "Hello",
      idempotencyKey,
    });

    expect(first).toEqual({
      ok: true,
      providerMessageId: `loopback:${MSG_1}`,
    });
    expect(retry).toEqual(first);
  });
});
