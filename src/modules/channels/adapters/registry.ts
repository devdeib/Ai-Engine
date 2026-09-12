/**
 * Static closed adapter registry. Unsupported channels do not fall back to test.
 */
import { emailDeliveryAdapter } from "@/modules/channels/adapters/email/delivery";
import { emailInboundAdapter } from "@/modules/channels/adapters/email/inbound";
import { smsDeliveryAdapter } from "@/modules/channels/adapters/sms/delivery";
import { smsInboundAdapter } from "@/modules/channels/adapters/sms/inbound";
import { telegramDeliveryAdapter } from "@/modules/channels/adapters/telegram/delivery";
import { telegramInboundAdapter } from "@/modules/channels/adapters/telegram/inbound";
import { testDeliveryAdapter } from "@/modules/channels/adapters/test-delivery";
import { testInboundAdapter } from "@/modules/channels/adapters/test-inbound";
import { whatsappDeliveryAdapter } from "@/modules/channels/adapters/whatsapp/delivery";
import { whatsappInboundAdapter } from "@/modules/channels/adapters/whatsapp/inbound";
import type {
  ChannelDeliveryAdapter,
  ChannelInboundAdapter,
} from "@/modules/channels/adapters/types";

const inboundAdapters = {
  test: testInboundAdapter,
  whatsapp: whatsappInboundAdapter,
  email: emailInboundAdapter,
  sms: smsInboundAdapter,
  telegram: telegramInboundAdapter,
} as const;

const deliveryAdapters = {
  test: testDeliveryAdapter,
  whatsapp: whatsappDeliveryAdapter,
  email: emailDeliveryAdapter,
  sms: smsDeliveryAdapter,
  telegram: telegramDeliveryAdapter,
} as const;

export class UnsupportedChannelError extends Error {
  constructor(channel: string) {
    super("Unsupported channel");
    this.name = "UnsupportedChannelError";
    this.cause = channel;
  }
}

export function getInboundAdapter(channel: string): ChannelInboundAdapter {
  if (channel === "test") {
    return inboundAdapters.test;
  }
  if (channel === "whatsapp") {
    return inboundAdapters.whatsapp;
  }
  if (channel === "email") {
    return inboundAdapters.email;
  }
  if (channel === "sms") {
    return inboundAdapters.sms;
  }
  if (channel === "telegram") {
    return inboundAdapters.telegram;
  }
  throw new UnsupportedChannelError(channel);
}

export function getDeliveryAdapter(channel: string): ChannelDeliveryAdapter {
  if (channel === "test") {
    return deliveryAdapters.test;
  }
  if (channel === "whatsapp") {
    return deliveryAdapters.whatsapp;
  }
  if (channel === "email") {
    return deliveryAdapters.email;
  }
  if (channel === "sms") {
    return deliveryAdapters.sms;
  }
  if (channel === "telegram") {
    return deliveryAdapters.telegram;
  }
  throw new UnsupportedChannelError(channel);
}
