/**
 * Narrow credential loader for channel_account_secrets.
 * Selects only secret columns, scoped to account id + organization id.
 * Does not query CRM tables. Callers must never log returned values.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface ChannelAccountSecretMaterial {
  webhookSecret: string;
  providerAccessToken: string | null;
  webhookVerifyToken: string | null;
}

export interface WhatsAppDeliveryCredentials {
  accessToken: string;
  phoneNumberId: string;
}

export interface EmailDeliveryCredentials {
  accessToken: string;
  mailbox: string;
}

export async function loadChannelAccountSecrets(
  organizationId: string,
  channelAccountId: string
): Promise<ChannelAccountSecretMaterial | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_account_secrets") as any)
    .select("webhook_secret, provider_access_token, webhook_verify_token")
    .eq("channel_account_id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const webhookSecret =
    typeof data?.webhook_secret === "string" ? data.webhook_secret : "";
  if (error || !webhookSecret) {
    return null;
  }

  return {
    webhookSecret,
    providerAccessToken:
      typeof data.provider_access_token === "string"
        ? data.provider_access_token
        : null,
    webhookVerifyToken:
      typeof data.webhook_verify_token === "string"
        ? data.webhook_verify_token
        : null,
  };
}

export async function loadWhatsAppDeliveryCredentials(
  organizationId: string,
  channelAccountId: string
): Promise<WhatsAppDeliveryCredentials | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountResult = await (supabase.from("channel_accounts") as any)
    .select("id, organization_id, channel, status, provider_destination_id")
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const account = accountResult.data as {
    channel?: string;
    status?: string;
    provider_destination_id?: string;
  } | null;

  if (
    accountResult.error ||
    !account ||
    account.channel !== "whatsapp" ||
    account.status !== "active" ||
    !account.provider_destination_id
  ) {
    return null;
  }

  const secrets = await loadChannelAccountSecrets(organizationId, channelAccountId);
  if (!secrets?.providerAccessToken) {
    return null;
  }

  return {
    accessToken: secrets.providerAccessToken,
    phoneNumberId: account.provider_destination_id,
  };
}

export async function loadEmailDeliveryCredentials(
  organizationId: string,
  channelAccountId: string
): Promise<EmailDeliveryCredentials | null> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountResult = await (supabase.from("channel_accounts") as any)
    .select("id, organization_id, channel, status, provider_destination_id")
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const account = accountResult.data as {
    channel?: string;
    status?: string;
    provider_destination_id?: string;
  } | null;

  if (
    accountResult.error ||
    !account ||
    account.channel !== "email" ||
    account.status !== "active" ||
    !account.provider_destination_id
  ) {
    return null;
  }

  const secrets = await loadChannelAccountSecrets(organizationId, channelAccountId);
  if (!secrets?.providerAccessToken) {
    return null;
  }

  return {
    accessToken: secrets.providerAccessToken,
    mailbox: account.provider_destination_id,
  };
}
