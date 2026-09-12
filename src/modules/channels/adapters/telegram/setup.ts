/**
 * Explicit Telegram setWebhook registration.
 * Never runs at process startup. Never returns the bot token or secret token.
 */
import "server-only";
import { env } from "@/lib/env";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { TELEGRAM_ALLOWED_UPDATES } from "@/modules/channels/adapters/telegram/constants";
import { callTelegramBotMethod, telegramApiOk } from "@/modules/channels/adapters/telegram/api";
import {
  classifyTelegramHttpError,
  classifyTelegramNetworkError,
} from "@/modules/channels/adapters/telegram/errors";
import { buildChannelWebhookUrl } from "@/modules/channels/webhook-url";
import { createClient } from "@/lib/supabase/server";
import { requireOrgRole } from "@/modules/organizations/queries";
import { loadChannelAccountSecrets } from "@/modules/channels/secrets";

type FetchFn = typeof fetch;

const OWNER_ADMIN_ROLES = ["owner", "admin"] as const;

export async function registerTelegramWebhook(input: {
  accessToken: string;
  secretToken: string;
  webhookUrl: string;
  fetchImpl?: FetchFn;
}): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  let response: { status: number; body: unknown };
  try {
    response = await callTelegramBotMethod({
      accessToken: input.accessToken,
      method: "setWebhook",
      body: {
        url: input.webhookUrl,
        secret_token: input.secretToken,
        allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
      },
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    const classified = classifyTelegramNetworkError(error);
    return { ok: false, errorCode: classified.errorCode };
  }

  if (response.status < 200 || response.status >= 300 || !telegramApiOk(response.body)) {
    const classified = classifyTelegramHttpError(response.status, response.body);
    return { ok: false, errorCode: classified.errorCode };
  }

  return { ok: true };
}

export async function setupTelegramChannelWebhook(
  organizationId: string,
  userId: string,
  channelAccountId: string
): Promise<{ registered: true }> {
  await requireOrgRole(organizationId, userId, [...OWNER_ADMIN_ROLES]);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select("id, organization_id, channel, status")
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Channel account");
  }
  if (data.channel !== "telegram") {
    throw new ValidationError("Invalid channel account data", {
      channel: ["Webhook setup is only available for Telegram accounts"],
    });
  }

  const secrets = await loadChannelAccountSecrets(organizationId, channelAccountId);
  if (!secrets?.webhookSecret || !secrets.providerAccessToken) {
    logger.error("Failed to register Telegram webhook", {
      organizationId,
      code: "CHANNEL_ACCOUNT_SECRET_MISSING",
    });
    throw new Error("Failed to register Telegram webhook");
  }

  const webhookUrl = buildChannelWebhookUrl(env.NEXT_PUBLIC_APP_URL, channelAccountId);
  const registered = await registerTelegramWebhook({
    accessToken: secrets.providerAccessToken,
    secretToken: secrets.webhookSecret,
    webhookUrl,
  });

  if (!registered.ok) {
    logger.error("Failed to register Telegram webhook", {
      organizationId,
      code: registered.errorCode,
    });
    if (
      registered.errorCode === "TELEGRAM_HTTP_401" ||
      registered.errorCode === "INVALID_ACCESS_TOKEN"
    ) {
      throw new ValidationError("Invalid channel account data", {
        access_token: ["Access token is invalid"],
      });
    }
    throw new Error("Failed to register Telegram webhook");
  }

  return { registered: true };
}
