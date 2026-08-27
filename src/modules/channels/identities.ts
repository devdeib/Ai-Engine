/**
 * Channel identities — external participants on a tenant channel account.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  toPublicChannelIdentity,
  type ChannelIdentityPublic,
} from "@/modules/channels/map";
import type { ChannelIdentity } from "@/lib/db/types";

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
