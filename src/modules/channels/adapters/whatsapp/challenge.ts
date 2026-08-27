/**
 * WhatsApp GET hub challenge. No CRM persistence, no AI, no messages.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "@/lib/errors";
import { signaturesMatch } from "@/modules/channels/hmac";
import { WHATSAPP_HUB_MODE_SUBSCRIBE } from "@/modules/channels/adapters/whatsapp/constants";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";
import type { ChannelAccount } from "@/lib/db/types";

function genericAuth(): AuthenticationError {
  return new AuthenticationError();
}

function verifyTokensMatch(expected: string, provided: string): boolean {
  return signaturesMatch(expected, provided);
}

export async function handleWhatsAppWebhookChallenge(input: {
  channelAccountId: string;
  searchParams: URLSearchParams;
}): Promise<string> {
  const admin = createAdminClient();
  return runWithSupabaseClientOverride(admin, async () => {
    const mode = input.searchParams.get("hub.mode")?.trim() ?? "";
    const providedToken = input.searchParams.get("hub.verify_token") ?? "";
    const challenge = input.searchParams.get("hub.challenge");
    if (
      mode !== WHATSAPP_HUB_MODE_SUBSCRIBE ||
      !providedToken ||
      challenge === null
    ) {
      throw genericAuth();
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accountResult = await (supabase.from("channel_accounts") as any)
      .select("id, organization_id, channel, status")
      .eq("id", input.channelAccountId)
      .maybeSingle();

    const account = accountResult.data as ChannelAccount | null;
    if (
      accountResult.error ||
      !account ||
      account.channel !== "whatsapp" ||
      account.status !== "active"
    ) {
      throw genericAuth();
    }

    const secrets = await loadChannelAccountSecrets(
      account.organization_id,
      account.id
    );
    if (!secrets?.webhookVerifyToken) {
      throw genericAuth();
    }

    if (!verifyTokensMatch(secrets.webhookVerifyToken, providedToken)) {
      throw genericAuth();
    }

    return challenge;
  });
}
