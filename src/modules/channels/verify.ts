import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "@/lib/errors";
import {
  CHANNEL_WEBHOOK_MAX_SKEW_MS,
} from "@/modules/channels/constants";
import {
  isWebhookTimestampFresh,
  parseWebhookTimestamp,
  signaturesMatch,
  signChannelWebhook,
} from "@/modules/channels/hmac";
import type { ChannelAccount } from "@/lib/db/types";

const GENERIC_AUTH = () => new AuthenticationError();

export async function verifyTestChannelWebhook(input: {
  channelAccountId: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  nowMs?: number;
}): Promise<ChannelAccount> {
  const timestampHeader = input.timestampHeader?.trim() ?? "";
  const signatureHeader = input.signatureHeader?.trim() ?? "";
  if (!timestampHeader || !signatureHeader) {
    throw GENERIC_AUTH();
  }

  const timestampMs = parseWebhookTimestamp(timestampHeader);
  if (timestampMs === null) {
    throw GENERIC_AUTH();
  }

  const nowMs = input.nowMs ?? Date.now();
  if (!isWebhookTimestampFresh(timestampMs, nowMs, CHANNEL_WEBHOOK_MAX_SKEW_MS)) {
    throw GENERIC_AUTH();
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountResult = await (supabase.from("channel_accounts") as any)
    .select("*")
    .eq("id", input.channelAccountId)
    .maybeSingle();

  const account = accountResult.data as ChannelAccount | null;
  if (accountResult.error || !account || account.status !== "active") {
    throw GENERIC_AUTH();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretResult = await (supabase.from("channel_account_secrets") as any)
    .select("webhook_secret")
    .eq("channel_account_id", account.id)
    .eq("organization_id", account.organization_id)
    .maybeSingle();

  const secret = secretResult.data?.webhook_secret as string | undefined;
  if (secretResult.error || !secret) {
    throw GENERIC_AUTH();
  }

  const expected = signChannelWebhook(secret, timestampHeader, input.rawBody);
  if (!signaturesMatch(expected, signatureHeader)) {
    throw GENERIC_AUTH();
  }

  return account;
}
