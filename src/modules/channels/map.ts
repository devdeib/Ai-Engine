import type {
  ChannelAccount,
  ChannelIdentity,
} from "@/lib/db/types";

export interface ChannelAccountPublic {
  id: string;
  organizationId: string;
  channel: ChannelAccount["channel"];
  status: ChannelAccount["status"];
  providerDestinationId: string;
  createdAt: string;
}

export interface ChannelAccountCreated extends ChannelAccountPublic {
  webhookSecret: string;
}

export interface ChannelIdentityPublic {
  id: string;
  organizationId: string;
  channelAccountId: string;
  externalAddress: string;
  leadId: string | null;
  createdAt: string;
}

export function toPublicChannelAccount(
  row: ChannelAccount
): ChannelAccountPublic {
  return {
    id: row.id,
    organizationId: row.organization_id,
    channel: row.channel,
    status: row.status,
    providerDestinationId: row.provider_destination_id,
    createdAt: row.created_at,
  };
}

export function toCreatedChannelAccount(
  row: ChannelAccount,
  webhookSecret: string
): ChannelAccountCreated {
  return {
    ...toPublicChannelAccount(row),
    webhookSecret,
  };
}

export function toPublicChannelIdentity(
  row: ChannelIdentity
): ChannelIdentityPublic {
  return {
    id: row.id,
    organizationId: row.organization_id,
    channelAccountId: row.channel_account_id,
    externalAddress: row.external_address,
    leadId: row.lead_id,
    createdAt: row.created_at,
  };
}
