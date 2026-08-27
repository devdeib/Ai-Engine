/**
 * Test-channel inbound adapter. HMAC verification stays here, not in generic ingest.
 */
import "server-only";
import { ValidationError } from "@/lib/errors";
import {
  CHANNEL_WEBHOOK_SIGNATURE_HEADER,
  CHANNEL_WEBHOOK_TIMESTAMP_HEADER,
} from "@/modules/channels/constants";
import { canonicalInboundSchema } from "@/modules/channels/schema";
import { verifyTestChannelWebhook } from "@/modules/channels/verify";
import type {
  ChannelInboundAdapter,
  ChannelInboundAdapterResult,
} from "@/modules/channels/adapters/types";

export const testInboundAdapter: ChannelInboundAdapter = {
  async verifyAndParse(input): Promise<ChannelInboundAdapterResult> {
    await verifyTestChannelWebhook({
      channelAccountId: input.channelAccountId,
      rawBody: input.rawBody,
      timestampHeader: input.headers.get(CHANNEL_WEBHOOK_TIMESTAMP_HEADER),
      signatureHeader: input.headers.get(CHANNEL_WEBHOOK_SIGNATURE_HEADER),
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(input.rawBody) as unknown;
    } catch {
      throw new ValidationError("Request body must be valid JSON");
    }

    const parsed = canonicalInboundSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid webhook payload",
        parsed.error.flatten().fieldErrors
      );
    }

    return { status: "inbound", event: parsed.data };
  },
};
