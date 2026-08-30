/**
 * Channel identities — external participants on a tenant channel account.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  toPublicChannelIdentity,
  type ChannelIdentityPublic,
} from "@/modules/channels/map";
import type { ChannelIdentity } from "@/lib/db/types";

const CHANNEL_IDENTITY_SELECT =
  "id, organization_id, channel_account_id, external_address, lead_id, created_at, updated_at";

async function loadChannelIdentityRow(
  organizationId: string,
  channelIdentityId: string
): Promise<ChannelIdentity> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_identities") as any)
    .select(CHANNEL_IDENTITY_SELECT)
    .eq("id", channelIdentityId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Channel identity");
  }

  return data as ChannelIdentity;
}

async function requireLeadInOrganization(
  organizationId: string,
  leadId: string
): Promise<void> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .select("id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }
}

export async function listChannelIdentities(
  organizationId: string,
  userId: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 20 },
  filter: { channelAccountId?: string } = {}
): Promise<ChannelIdentityPublic[]> {
  await requireOrgMembership(organizationId, userId);

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from("channel_identities")
    .select("*")
    .eq("organization_id", organizationId);

  if (filter.channelAccountId) {
    query = query.eq("channel_account_id", filter.channelAccountId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error("Failed to list channel identities");
  }

  return ((data ?? []) as ChannelIdentity[]).map(toPublicChannelIdentity);
}

export async function getChannelIdentity(
  organizationId: string,
  userId: string,
  channelIdentityId: string
): Promise<ChannelIdentityPublic> {
  await requireOrgMembership(organizationId, userId);
  const identity = await loadChannelIdentityRow(
    organizationId,
    channelIdentityId
  );
  return toPublicChannelIdentity(identity);
}

export async function attachChannelIdentityLead(
  organizationId: string,
  userId: string,
  channelIdentityId: string,
  leadId: string
): Promise<ChannelIdentityPublic> {
  await requireOrgMembership(organizationId, userId);

  const identity = await loadChannelIdentityRow(
    organizationId,
    channelIdentityId
  );
  await requireLeadInOrganization(organizationId, leadId);

  if (identity.lead_id === leadId) {
    return toPublicChannelIdentity(identity);
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(
    "attach_channel_identity_lead",
    {
      p_organization_id: organizationId,
      p_channel_identity_id: channelIdentityId,
      p_lead_id: leadId,
    }
  );

  if (error) {
    logger.error("Failed to attach channel identity lead", {
      organizationId,
      code: error.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to attach channel identity lead");
  }

  const row = (Array.isArray(data) ? data[0] : data) as ChannelIdentity | null;
  if (!row) {
    logger.error("Failed to attach channel identity lead", {
      organizationId,
      code: "CHANNEL_IDENTITY_ATTACH_EMPTY",
    });
    throw new Error("Failed to attach channel identity lead");
  }

  return toPublicChannelIdentity(row);
}
