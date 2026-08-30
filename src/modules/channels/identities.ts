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
import {
  CHANNEL_ACCOUNT_MATCH_SELECT,
  CHANNEL_IDENTITY_MATCH_CANDIDATE_SELECT,
  isChannelStubLead,
  leadMatchesNormalizedAddress,
  normalizeChannelAddress,
  toPublicMatchCandidate,
  type ChannelIdentityMatchCandidate,
  type ChannelStubLeadFields,
} from "@/modules/channels/match";
import type { ChannelAccount, ChannelIdentity, Lead } from "@/lib/db/types";

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

const STUB_LEAD_SELECT = "id, first_name, last_name, email, phone";

export interface ListChannelIdentitiesFilter {
  channelAccountId?: string;
  leadId?: string;
  unmatched?: boolean;
}

async function loadChannelAccountChannel(
  organizationId: string,
  channelAccountId: string
): Promise<ChannelAccount["channel"]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select(CHANNEL_ACCOUNT_MATCH_SELECT)
    .eq("id", channelAccountId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Failed to load channel account for identity matching");
  }

  return (data as Pick<ChannelAccount, "channel">).channel;
}

function compareMatchCandidates(
  left: ChannelIdentityMatchCandidate,
  right: ChannelIdentityMatchCandidate
): number {
  const last = left.lastName.localeCompare(right.lastName);
  if (last !== 0) return last;
  const first = left.firstName.localeCompare(right.firstName);
  if (first !== 0) return first;
  return left.id.localeCompare(right.id);
}

export async function listChannelIdentities(
  organizationId: string,
  userId: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 20 },
  filter: ListChannelIdentitiesFilter = {}
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
  if (filter.leadId) {
    query = query.eq("lead_id", filter.leadId);
  }

  const ordered = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const { data, error } =
    filter.unmatched === undefined
      ? await ordered.range(offset, offset + limit - 1)
      : await ordered;

  if (error) {
    throw new Error("Failed to list channel identities");
  }

  const identities = (data ?? []) as ChannelIdentity[];
  if (filter.unmatched === undefined) {
    return identities.map(toPublicChannelIdentity);
  }

  const leadIds = [
    ...new Set(
      identities
        .map((identity) => identity.lead_id)
        .filter((leadId): leadId is string => Boolean(leadId))
    ),
  ];
  if (leadIds.length === 0) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadsResult = await (supabase.from("leads") as any)
    .select(STUB_LEAD_SELECT)
    .eq("organization_id", organizationId)
    .in("id", leadIds);

  if (leadsResult.error) {
    throw new Error("Failed to list channel identities");
  }

  const leadsById = new Map<string, ChannelStubLeadFields>(
    ((leadsResult.data ?? []) as Array<ChannelStubLeadFields & { id: string }>).map(
      (lead) => [lead.id, lead]
    )
  );

  const filtered = identities.filter((identity) => {
    if (!identity.lead_id) {
      return false;
    }
    const lead = leadsById.get(identity.lead_id);
    if (!lead) {
      return false;
    }
    const stub = isChannelStubLead(lead);
    return filter.unmatched ? stub : !stub;
  });

  return filtered.slice(offset, offset + limit).map(toPublicChannelIdentity);
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

export async function listChannelIdentityMatchCandidates(
  organizationId: string,
  userId: string,
  channelIdentityId: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 20 }
): Promise<ChannelIdentityMatchCandidate[]> {
  await requireOrgMembership(organizationId, userId);

  const identity = await loadChannelIdentityRow(
    organizationId,
    channelIdentityId
  );
  const channel = await loadChannelAccountChannel(
    organizationId,
    identity.channel_account_id
  );
  const normalizedAddress = normalizeChannelAddress(
    channel,
    identity.external_address
  );
  if (!normalizedAddress) {
    return [];
  }

  const { page, limit } = pagination;
  const offset = (page - 1) * limit;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .select(CHANNEL_IDENTITY_MATCH_CANDIDATE_SELECT)
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error("Failed to list identity match candidates");
  }

  const leads = (data ?? []) as Array<
    Pick<
      Lead,
      | "id"
      | "first_name"
      | "last_name"
      | "email"
      | "phone"
      | "company_name"
      | "status"
    >
  >;

  let currentLeadIsStub = false;
  if (identity.lead_id) {
    const current = leads.find((lead) => lead.id === identity.lead_id);
    currentLeadIsStub = current ? isChannelStubLead(current) : false;
  }

  const candidates = leads
    .filter((lead) => {
      if (isChannelStubLead(lead)) {
        return false;
      }
      if (currentLeadIsStub && lead.id === identity.lead_id) {
        return false;
      }
      return leadMatchesNormalizedAddress(channel, normalizedAddress, lead);
    })
    .map(toPublicMatchCandidate)
    .sort(compareMatchCandidates);

  return candidates.slice(offset, offset + limit);
}
