import type { ChannelAccount } from "@/lib/db/types";
import type { CanonicalInbound } from "@/modules/channels/schema";

export interface ChannelWebhookHeaders {
  get(name: string): string | null;
}

export interface ChannelInboundAdapterInput {
  channelAccountId: string;
  account: ChannelAccount;
  rawBody: string;
  headers: ChannelWebhookHeaders;
}

export type ChannelInboundAdapterResult =
  | { status: "inbound"; event: CanonicalInbound }
  | { status: "ignored" };

export interface ChannelInboundAdapter {
  verifyAndParse(
    input: ChannelInboundAdapterInput
  ): Promise<ChannelInboundAdapterResult>;
}

export interface ChannelDeliverySendInput {
  organizationId: string;
  channelAccountId: string;
  channelIdentityId: string;
  messageId: string;
  destination: string;
  body: string;
  idempotencyKey: string;
}

export type ChannelDeliverySendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string; retryable: boolean };

export interface ChannelDeliveryAdapter {
  send(input: ChannelDeliverySendInput): Promise<ChannelDeliverySendResult>;
}
