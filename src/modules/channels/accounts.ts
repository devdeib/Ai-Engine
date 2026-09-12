/**
 * Channel accounts — tenant-owned provider connections.
 * Webhook secrets are never selected after creation.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireOrgMembership,
  requireOrgRole,
} from "@/modules/organizations/queries";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { generateChannelWebhookSecret } from "@/modules/channels/hmac";
import { env } from "@/lib/env";
import {
  createChannelAccountSchema,
  parseChannelAccountRotateBody,
  updateChannelAccountStatusSchema,
  type CreateChannelAccountInput,
} from "@/modules/channels/schema";
import {
  toCreatedChannelAccount,
  toPublicChannelAccount,
  type ChannelAccountCreated,
  type ChannelAccountPublic,
} from "@/modules/channels/map";
import { normalizeEmailAddress } from "@/modules/channels/adapters/email/parse";
import { normalizeSmsAddress } from "@/modules/channels/adapters/sms/parse";
import { normalizeTelegramDestination } from "@/modules/channels/adapters/telegram/parse";
import { registerTelegramWebhook } from "@/modules/channels/adapters/telegram/setup";
import { buildChannelWebhookUrl } from "@/modules/channels/webhook-url";
import type { ChannelAccount } from "@/lib/db/types";

const CHANNEL_ACCOUNT_SELECT =
  "id, organization_id, channel, status, provider_destination_id, created_by_user_id, created_at, updated_at";

const OWNER_ADMIN_ROLES = ["owner", "admin"] as const;

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

async function loadChannelAccountRow(
  organizationId: string,
  channelAccountId: string
): Promise<ChannelAccount> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select(CHANNEL_ACCOUNT_SELECT)
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Channel account");
  }

  return data as ChannelAccount;
}

function secretReplacementForRotation(
  parsed: CreateChannelAccountInput,
  generatedTestSecret: string | null
): Record<string, string> {
  if (parsed.channel === "test") {
    return { webhook_secret: generatedTestSecret ?? "" };
  }

  if (parsed.channel === "whatsapp") {
    return {
      webhook_secret: parsed.app_secret ?? "",
      provider_access_token: parsed.access_token?.trim() ?? "",
      webhook_verify_token: parsed.webhook_verify_token?.trim() ?? "",
    };
  }

  if (parsed.channel === "telegram") {
    return {
      webhook_secret: generatedTestSecret ?? "",
      provider_access_token: parsed.access_token?.trim() ?? "",
    };
  }

  return {
    webhook_secret: parsed.webhook_signing_secret ?? "",
    provider_access_token: parsed.access_token?.trim() ?? "",
  };
}

export async function createChannelAccount(
  organizationId: string,
  userId: string,
  input: unknown
): Promise<ChannelAccountCreated | ChannelAccountPublic> {
  const parsed = createChannelAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid channel account data",
      parsed.error.flatten().fieldErrors
    );
  }

  if (parsed.data.channel === "whatsapp") {
    return createWhatsAppChannelAccount(organizationId, userId, parsed.data);
  }

  if (parsed.data.channel === "email") {
    return createEmailChannelAccount(organizationId, userId, parsed.data);
  }

  if (parsed.data.channel === "sms") {
    return createSmsChannelAccount(organizationId, userId, parsed.data);
  }

  if (parsed.data.channel === "telegram") {
    return createTelegramChannelAccount(organizationId, userId, parsed.data);
  }

  if (parsed.data.channel === "test") {
    return createTestChannelAccount(organizationId, userId, parsed.data);
  }

  throw new ValidationError("Invalid channel account data");
}

export async function createEmailChannelAccount(
  organizationId: string,
  userId: string,
  input: CreateChannelAccountInput
): Promise<ChannelAccountPublic> {
  await requireOrgMembership(organizationId, userId);

  const destination = normalizeEmailAddress(input.provider_destination_id);
  if (!destination.includes("@") || destination.length > 128) {
    throw new ValidationError("Invalid channel account data", {
      provider_destination_id: ["Destination must be an email address"],
    });
  }

  const accessToken = input.access_token?.trim() ?? "";
  const signingSecret = input.webhook_signing_secret ?? "";
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .insert({
      organization_id: organizationId,
      channel: "email",
      status: "active",
      provider_destination_id: destination,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("A channel account already exists for this destination");
  }
  if (error || !data) {
    throw new Error("Failed to create channel account");
  }

  const account = data as ChannelAccount;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretInsert = await (admin.from("channel_account_secrets") as any).insert({
    channel_account_id: account.id,
    organization_id: organizationId,
    webhook_secret: signingSecret,
    provider_access_token: accessToken,
  });

  if (secretInsert.error) {
    logger.error("Failed to store channel account secret", {
      organizationId,
      code: secretInsert.error.code ?? "INTERNAL_ERROR",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after secret insert failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

    throw new Error("Failed to store channel account secret");
  }

  return toPublicChannelAccount(account);
}

export async function createSmsChannelAccount(
  organizationId: string,
  userId: string,
  input: CreateChannelAccountInput
): Promise<ChannelAccountPublic> {
  await requireOrgMembership(organizationId, userId);

  const destination = normalizeSmsAddress(input.provider_destination_id);
  if (!destination) {
    throw new ValidationError("Invalid channel account data", {
      provider_destination_id: ["Destination must be a canonical E.164 number"],
    });
  }

  const accessToken = input.access_token?.trim() ?? "";
  const signingSecret = input.webhook_signing_secret ?? "";
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .insert({
      organization_id: organizationId,
      channel: "sms",
      status: "active",
      provider_destination_id: destination,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("A channel account already exists for this destination");
  }
  if (error || !data) {
    throw new Error("Failed to create channel account");
  }

  const account = data as ChannelAccount;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretInsert = await (admin.from("channel_account_secrets") as any).insert({
    channel_account_id: account.id,
    organization_id: organizationId,
    webhook_secret: signingSecret,
    provider_access_token: accessToken,
  });

  if (secretInsert.error) {
    logger.error("Failed to store channel account secret", {
      organizationId,
      code: secretInsert.error.code ?? "INTERNAL_ERROR",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after secret insert failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

    throw new Error("Failed to store channel account secret");
  }

  return toPublicChannelAccount(account);
}

export async function createTelegramChannelAccount(
  organizationId: string,
  userId: string,
  input: CreateChannelAccountInput
): Promise<ChannelAccountPublic> {
  await requireOrgMembership(organizationId, userId);

  const destination = normalizeTelegramDestination(input.provider_destination_id);
  if (!destination) {
    throw new ValidationError("Invalid channel account data", {
      provider_destination_id: ["Destination is required"],
    });
  }

  const accessToken = input.access_token?.trim() ?? "";
  const webhookSecret = generateChannelWebhookSecret();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .insert({
      organization_id: organizationId,
      channel: "telegram",
      status: "active",
      provider_destination_id: destination,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("A channel account already exists for this destination");
  }
  if (error || !data) {
    throw new Error("Failed to create channel account");
  }

  const account = data as ChannelAccount;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretInsert = await (admin.from("channel_account_secrets") as any).insert({
    channel_account_id: account.id,
    organization_id: organizationId,
    webhook_secret: webhookSecret,
    provider_access_token: accessToken,
  });

  if (secretInsert.error) {
    logger.error("Failed to store channel account secret", {
      organizationId,
      code: secretInsert.error.code ?? "INTERNAL_ERROR",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after secret insert failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

    throw new Error("Failed to store channel account secret");
  }

  const registered = await registerTelegramWebhook({
    accessToken,
    secretToken: webhookSecret,
    webhookUrl: buildChannelWebhookUrl(env.NEXT_PUBLIC_APP_URL, account.id),
  });

  if (!registered.ok) {
    logger.error("Failed to register Telegram webhook", {
      organizationId,
      code: registered.errorCode,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after webhook setup failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

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

  return toPublicChannelAccount(account);
}

export async function createWhatsAppChannelAccount(
  organizationId: string,
  userId: string,
  input: CreateChannelAccountInput
): Promise<ChannelAccountPublic> {
  await requireOrgMembership(organizationId, userId);

  const destination = input.provider_destination_id.trim();
  const accessToken = input.access_token?.trim() ?? "";
  const verifyToken = input.webhook_verify_token?.trim() ?? "";
  const appSecret = input.app_secret ?? "";
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .insert({
      organization_id: organizationId,
      channel: "whatsapp",
      status: "active",
      provider_destination_id: destination,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("A channel account already exists for this destination");
  }
  if (error || !data) {
    throw new Error("Failed to create channel account");
  }

  const account = data as ChannelAccount;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretInsert = await (admin.from("channel_account_secrets") as any).insert({
    channel_account_id: account.id,
    organization_id: organizationId,
    webhook_secret: appSecret,
    provider_access_token: accessToken,
    webhook_verify_token: verifyToken,
  });

  if (secretInsert.error) {
    logger.error("Failed to store channel account secret", {
      organizationId,
      code: secretInsert.error.code ?? "INTERNAL_ERROR",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after secret insert failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

    throw new Error("Failed to store channel account secret");
  }

  return toPublicChannelAccount(account);
}

export async function createTestChannelAccount(
  organizationId: string,
  userId: string,
  input: unknown
): Promise<ChannelAccountCreated> {
  await requireOrgMembership(organizationId, userId);

  const parsed = createChannelAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid channel account data",
      parsed.error.flatten().fieldErrors
    );
  }

  const destination = parsed.data.provider_destination_id.trim().toLowerCase();
  const secret = generateChannelWebhookSecret();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .insert({
      organization_id: organizationId,
      channel: "test",
      status: "active",
      provider_destination_id: destination,
      created_by_user_id: userId,
    })
    .select()
    .single();

  if (isUniqueViolation(error)) {
    throw new ConflictError("A channel account already exists for this destination");
  }
  if (error || !data) {
    throw new Error("Failed to create channel account");
  }

  const account = data as ChannelAccount;
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretInsert = await (admin.from("channel_account_secrets") as any).insert({
    channel_account_id: account.id,
    organization_id: organizationId,
    webhook_secret: secret,
  });

  if (secretInsert.error) {
    logger.error("Failed to store channel account secret", {
      organizationId,
      code: secretInsert.error.code ?? "INTERNAL_ERROR",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rollback = await (admin.from("channel_accounts") as any)
      .delete()
      .eq("id", account.id)
      .eq("organization_id", organizationId);

    if (rollback.error) {
      logger.error("Failed to roll back channel account after secret insert failure", {
        organizationId,
        code: rollback.error.code ?? "INTERNAL_ERROR",
      });
    }

    throw new Error("Failed to store channel account secret");
  }

  return toCreatedChannelAccount(account, secret);
}

export async function listChannelAccounts(
  organizationId: string,
  userId: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<ChannelAccountPublic[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select(
      "id, organization_id, channel, status, provider_destination_id, created_by_user_id, created_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error("Failed to list channel accounts");
  }

  return ((data ?? []) as ChannelAccount[]).map(toPublicChannelAccount);
}

export async function getChannelAccount(
  organizationId: string,
  userId: string,
  channelAccountId: string
): Promise<ChannelAccountPublic> {
  await requireOrgMembership(organizationId, userId);
  const account = await loadChannelAccountRow(organizationId, channelAccountId);
  return toPublicChannelAccount(account);
}

export async function updateChannelAccountStatus(
  organizationId: string,
  userId: string,
  channelAccountId: string,
  input: unknown
): Promise<ChannelAccountPublic> {
  await requireOrgRole(organizationId, userId, [...OWNER_ADMIN_ROLES]);

  const parsed = updateChannelAccountStatusSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      "Validation failed",
      parsed.error.flatten().fieldErrors
    );
  }

  const existing = await loadChannelAccountRow(organizationId, channelAccountId);
  if (existing.status === parsed.data.status) {
    return toPublicChannelAccount(existing);
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .update({ status: parsed.data.status })
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .select(CHANNEL_ACCOUNT_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error("Failed to update channel account");
  }
  if (!data) {
    throw new NotFoundError("Channel account");
  }

  return toPublicChannelAccount(data as ChannelAccount);
}

export async function rotateChannelAccountSecrets(
  organizationId: string,
  userId: string,
  channelAccountId: string,
  body: unknown
): Promise<ChannelAccountCreated | ChannelAccountPublic> {
  await requireOrgRole(organizationId, userId, [...OWNER_ADMIN_ROLES]);

  const account = await loadChannelAccountRow(organizationId, channelAccountId);
  const parsed = parseChannelAccountRotateBody(
    account.channel,
    account.provider_destination_id,
    body
  );
  if (!parsed.success) {
    throw new ValidationError(
      "Invalid channel account data",
      parsed.error.fieldErrors
    );
  }

  const generatedWebhookSecret =
    account.channel === "test" || account.channel === "telegram"
      ? generateChannelWebhookSecret()
      : null;
  const replacement = secretReplacementForRotation(
    parsed.data,
    generatedWebhookSecret
  );

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secretUpdate = await (admin.from("channel_account_secrets") as any)
    .update(replacement)
    .eq("channel_account_id", channelAccountId)
    .eq("organization_id", organizationId)
    .select("channel_account_id")
    .maybeSingle();

  if (secretUpdate.error) {
    logger.error("Failed to rotate channel account secret", {
      organizationId,
      code: secretUpdate.error.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to rotate channel account secret");
  }

  if (!secretUpdate.data) {
    logger.error("Failed to rotate channel account secret", {
      organizationId,
      code: "CHANNEL_ACCOUNT_SECRET_MISSING",
    });
    throw new Error("Failed to rotate channel account secret");
  }

  if (account.channel === "telegram" && generatedWebhookSecret) {
    const registered = await registerTelegramWebhook({
      accessToken: parsed.data.access_token?.trim() ?? "",
      secretToken: generatedWebhookSecret,
      webhookUrl: buildChannelWebhookUrl(env.NEXT_PUBLIC_APP_URL, account.id),
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
  }

  if (account.channel === "test" && generatedWebhookSecret) {
    return toCreatedChannelAccount(account, generatedWebhookSecret);
  }

  return toPublicChannelAccount(account);
}
