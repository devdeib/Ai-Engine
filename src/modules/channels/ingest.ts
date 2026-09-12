/**
 * Channel ingest. Authenticates via the inbound adapter, persists, and enqueues.
 * Never invokes the AI execution pipeline. The worker remains the only caller.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { scheduleAiJobProcessing } from "@/modules/ai/jobs/schedule";
import { processDueAiJobs } from "@/modules/ai/jobs/worker";
import {
  getInboundAdapter,
  UnsupportedChannelError,
} from "@/modules/channels/adapters/registry";
import type { ChannelWebhookHeaders } from "@/modules/channels/adapters/types";
import {
  CHANNEL_STUB_LEAD_FIRST_NAME,
  CHANNEL_STUB_LEAD_LAST_NAME,
  CHANNEL_WEBHOOK_SIGNATURE_HEADER,
  CHANNEL_WEBHOOK_TIMESTAMP_HEADER,
} from "@/modules/channels/constants";
import { normalizeExternalAddress } from "@/modules/channels/hmac";
import { isChannelStubLead } from "@/modules/channels/match";
import type {
  ChannelAccount,
  ChannelIdentity,
  Conversation,
  Lead,
} from "@/lib/db/types";

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "23505" ||
    /duplicate key|unique constraint/i.test(error.message ?? "")
  );
}

export interface IngestChannelWebhookResult {
  accepted: true;
}

export async function ingestChannelWebhook(input: {
  channelAccountId: string;
  rawBody: string;
  headers: ChannelWebhookHeaders;
}): Promise<IngestChannelWebhookResult> {
  const admin = createAdminClient();
  return runWithSupabaseClientOverride(admin, async () => {
    const account = await loadActiveChannelAccount(input.channelAccountId);
    let adapter;
    try {
      adapter = getInboundAdapter(account.channel);
    } catch (error) {
      if (error instanceof UnsupportedChannelError) {
        throw new AuthenticationError();
      }
      throw error;
    }
    const parsed = await adapter.verifyAndParse({
      channelAccountId: input.channelAccountId,
      account,
      rawBody: input.rawBody,
      headers: input.headers,
    });

    if (parsed.status === "ignored") {
      return { accepted: true };
    }

    const from = normalizeExternalAddress(parsed.event.from);
    const to = normalizeExternalAddress(parsed.event.to);
    if (to !== normalizeExternalAddress(account.provider_destination_id)) {
      throw new AuthenticationError();
    }

    const supabase = await createClient();
    const existing = await findInboundRef(
      supabase,
      account.id,
      parsed.event.providerMessageId
    );
    if (existing) {
      await enqueueChannelIngressJob({
        organizationId: account.organization_id,
        conversationId: existing.conversationId,
        inboundMessageId: existing.messageId,
        channelIdentityId: existing.channelIdentityId,
      });
      return { accepted: true };
    }

    const identity = await upsertChannelIdentity({
      organizationId: account.organization_id,
      channelAccountId: account.id,
      externalAddress: from,
      senderFirstName: parsed.event.senderFirstName,
      senderLastName: parsed.event.senderLastName,
    });

    const conversation = await openExternalConversation({
      organizationId: account.organization_id,
      leadId: identity.leadId,
      channel: account.channel,
      channelAccountId: account.id,
      channelIdentityId: identity.id,
    });

    const persisted = await persistChannelInbound({
      organizationId: account.organization_id,
      conversationId: conversation.id,
      channelAccountId: account.id,
      channelIdentityId: identity.id,
      providerMessageId: parsed.event.providerMessageId,
      body: parsed.event.body,
    });

    await enqueueChannelIngressJob({
      organizationId: account.organization_id,
      conversationId: persisted.conversationId,
      inboundMessageId: persisted.messageId,
      channelIdentityId: persisted.channelIdentityId,
    });

    return { accepted: true };
  });
}

/** Preserves the Phase 5.1 test webhook call shape. */
export async function ingestTestWebhook(input: {
  channelAccountId: string;
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): Promise<IngestChannelWebhookResult> {
  const headers = new Headers();
  if (input.timestampHeader) {
    headers.set(CHANNEL_WEBHOOK_TIMESTAMP_HEADER, input.timestampHeader);
  }
  if (input.signatureHeader) {
    headers.set(CHANNEL_WEBHOOK_SIGNATURE_HEADER, input.signatureHeader);
  }
  return ingestChannelWebhook({
    channelAccountId: input.channelAccountId,
    rawBody: input.rawBody,
    headers,
  });
}

async function enqueueChannelIngressJob(input: {
  organizationId: string;
  conversationId: string;
  inboundMessageId: string;
  channelIdentityId: string;
}): Promise<void> {
  await enqueueAiExecutionJob({
    organizationId: input.organizationId,
    userId: null,
    conversationId: input.conversationId,
    inboundMessageId: input.inboundMessageId,
    triggerSource: "channel_ingress",
    channelIdentityId: input.channelIdentityId,
  });
  scheduleAiJobProcessing(async () => {
    await processDueAiJobs({
      organizationId: input.organizationId,
      useAdminClient: true,
    });
  });
}

type QueryClient = Awaited<ReturnType<typeof createClient>>;

async function loadActiveChannelAccount(
  channelAccountId: string
): Promise<ChannelAccount> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_accounts") as any)
    .select("*")
    .eq("id", channelAccountId)
    .maybeSingle();

  const account = data as ChannelAccount | null;
  if (error || !account || account.status !== "active") {
    throw new AuthenticationError();
  }
  return account;
}

async function findInboundRef(
  supabase: QueryClient,
  channelAccountId: string,
  providerMessageId: string
): Promise<{
  messageId: string;
  conversationId: string;
  channelIdentityId: string;
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("channel_message_refs") as any)
    .select("message_id, channel_identity_id")
    .eq("channel_account_id", channelAccountId)
    .eq("provider_message_id", providerMessageId)
    .eq("direction", "inbound")
    .maybeSingle();

  if (error || !data?.message_id || !data.channel_identity_id) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const message = await (supabase.from("messages") as any)
    .select("id, conversation_id")
    .eq("id", data.message_id)
    .maybeSingle();

  if (message.error || !message.data?.conversation_id) {
    return null;
  }

  return {
    messageId: data.message_id as string,
    conversationId: message.data.conversation_id as string,
    channelIdentityId: data.channel_identity_id as string,
  };
}

async function upsertChannelIdentity(input: {
  organizationId: string;
  channelAccountId: string;
  externalAddress: string;
  senderFirstName?: string;
  senderLastName?: string;
}): Promise<{ id: string; leadId: string }> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supabase.from("channel_identities") as any)
    .select("*")
    .eq("channel_account_id", input.channelAccountId)
    .eq("external_address", input.externalAddress)
    .maybeSingle();

  if (existing.data) {
    const row = existing.data as ChannelIdentity;
    if (row.lead_id) {
      await applySenderNameToStubLead({
        organizationId: input.organizationId,
        leadId: row.lead_id,
        senderFirstName: input.senderFirstName,
        senderLastName: input.senderLastName,
      });
      return { id: row.id, leadId: row.lead_id };
    }
    const lead = await createStubLead(input.organizationId, {
      firstName: input.senderFirstName,
      lastName: input.senderLastName,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (supabase.from("channel_identities") as any)
      .update({ lead_id: lead.id })
      .eq("id", row.id)
      .eq("organization_id", input.organizationId)
      .select()
      .single();
    if (updated.error || !updated.data) {
      throw new Error("Failed to attach stub lead to channel identity");
    }
    return { id: row.id, leadId: lead.id };
  }

  const lead = await createStubLead(input.organizationId, {
    firstName: input.senderFirstName,
    lastName: input.senderLastName,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = await (supabase.from("channel_identities") as any)
    .insert({
      organization_id: input.organizationId,
      channel_account_id: input.channelAccountId,
      external_address: input.externalAddress,
      lead_id: lead.id,
    })
    .select()
    .single();

  if (isUniqueViolation(inserted.error)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raced = await (supabase.from("channel_identities") as any)
      .select("*")
      .eq("channel_account_id", input.channelAccountId)
      .eq("external_address", input.externalAddress)
      .maybeSingle();
    const row = raced.data as ChannelIdentity | null;
    if (!row?.lead_id) {
      throw new Error("Failed to load channel identity");
    }
    return { id: row.id, leadId: row.lead_id };
  }

  if (inserted.error || !inserted.data) {
    throw new Error("Failed to create channel identity");
  }

  const created = inserted.data as ChannelIdentity;
  if (!created.lead_id) {
    throw new Error("Failed to create channel identity");
  }
  return { id: created.id, leadId: created.lead_id };
}

async function applySenderNameToStubLead(input: {
  organizationId: string;
  leadId: string;
  senderFirstName?: string;
  senderLastName?: string;
}): Promise<void> {
  if (!input.senderFirstName || !input.senderLastName) {
    return;
  }
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .select("id, first_name, last_name, email, phone")
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !data || !isChannelStubLead(data)) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = await (supabase.from("leads") as any)
    .update({
      first_name: input.senderFirstName,
      last_name: input.senderLastName,
    })
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId);

  if (updated.error) {
    logger.error("Failed to apply sender name to stub lead", {
      organizationId: input.organizationId,
      code: updated.error.code ?? "INTERNAL_ERROR",
    });
  }
}

async function createStubLead(
  organizationId: string,
  sender?: { firstName?: string; lastName?: string }
): Promise<Lead> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .insert({
      organization_id: organizationId,
      first_name: sender?.firstName || CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: sender?.lastName || CHANNEL_STUB_LEAD_LAST_NAME,
      source: "other",
      status: "new",
    })
    .select()
    .single();

  if (error || !data) {
    logger.error("Failed to create stub lead", {
      organizationId,
      code: error?.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to create stub lead");
  }

  return data as Lead;
}

async function openExternalConversation(input: {
  organizationId: string;
  leadId: string;
  channel: string;
  channelAccountId: string;
  channelIdentityId: string;
}): Promise<Conversation> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supabase.from("conversations") as any)
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("channel_identity_id", input.channelIdentityId)
    .eq("channel", input.channel)
    .eq("status", "open")
    .maybeSingle();

  if (existing.data) {
    return existing.data as Conversation;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = await (supabase.from("conversations") as any)
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      channel: input.channel,
      channel_account_id: input.channelAccountId,
      channel_identity_id: input.channelIdentityId,
    })
    .select()
    .single();

  if (isUniqueViolation(inserted.error)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raced = await (supabase.from("conversations") as any)
      .select("*")
      .eq("organization_id", input.organizationId)
      .eq("channel_identity_id", input.channelIdentityId)
      .eq("channel", input.channel)
      .eq("status", "open")
      .maybeSingle();
    if (!raced.data) {
      throw new Error("Failed to open external conversation");
    }
    return raced.data as Conversation;
  }

  if (inserted.error || !inserted.data) {
    throw new Error("Failed to create external conversation");
  }

  return inserted.data as Conversation;
}

async function persistChannelInbound(input: {
  organizationId: string;
  conversationId: string;
  channelAccountId: string;
  channelIdentityId: string;
  providerMessageId: string;
  body: string;
}): Promise<{
  messageId: string;
  conversationId: string;
  channelIdentityId: string;
  created: boolean;
}> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("persist_channel_inbound", {
    p_organization_id: input.organizationId,
    p_conversation_id: input.conversationId,
    p_channel_account_id: input.channelAccountId,
    p_channel_identity_id: input.channelIdentityId,
    p_provider_message_id: input.providerMessageId,
    p_body: input.body,
  });

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
    message_id?: string;
    conversation_id?: string;
    channel_identity_id?: string;
    created?: boolean;
  }>;
  const row = rows[0];

  if (error || !row?.message_id || !row.conversation_id || !row.channel_identity_id) {
    logger.error("Failed to persist inbound channel message", {
      organizationId: input.organizationId,
      code: error?.code ?? "INTERNAL_ERROR",
    });
    throw new Error("Failed to persist inbound channel message");
  }

  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    channelIdentityId: row.channel_identity_id,
    created: row.created === true,
  };
}
