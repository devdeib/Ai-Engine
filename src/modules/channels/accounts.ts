/**
 * Channel accounts — tenant-owned provider connections.
 * Webhook secrets are never selected after creation.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { generateChannelWebhookSecret } from "@/modules/channels/hmac";
import {
  createChannelAccountSchema,
  type CreateChannelAccountInput,
} from "@/modules/channels/schema";
import {
  toCreatedChannelAccount,
  toPublicChannelAccount,
  type ChannelAccountCreated,
  type ChannelAccountPublic,
} from "@/modules/channels/map";
import { normalizeEmailAddress } from "@/modules/channels/adapters/email/parse";
import type { ChannelAccount } from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
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
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select(
      "id, organization_id, channel, status, provider_destination_id, created_by_user_id, created_at, updated_at"
    )
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Channel account");
  }

  return toPublicChannelAccount(data as ChannelAccount);
}
