/**
 * Telegram inbound ingest contract. Generic persistence; adapter only verifies/parses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthenticationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ role: "service" })),
}));
vi.mock("@/lib/supabase/client-override", () => ({
  runWithSupabaseClientOverride: vi.fn(
    async (_client: unknown, fn: () => Promise<unknown>) => fn()
  ),
}));
vi.mock("@/modules/ai/jobs/enqueue", () => ({
  enqueueAiExecutionJob: vi.fn(),
}));
vi.mock("@/modules/ai/jobs/schedule", () => ({
  scheduleAiJobProcessing: vi.fn(),
}));
vi.mock("@/modules/ai/jobs/worker", () => ({
  processDueAiJobs: vi.fn(),
}));
vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { processConversationMessage } from "@/modules/ai/service";
import { ingestChannelWebhook } from "@/modules/channels/ingest";
import { TELEGRAM_SECRET_TOKEN_HEADER } from "@/modules/channels/adapters/telegram/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";
const WEBHOOK_SECRET = "s".repeat(64);
const BOT_DEST = "vg_sales_bot";
const CHAT_ID = "1001234567";

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "telegram",
  status: "active",
  provider_destination_id: BOT_DEST,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-09-09T00:00:00Z",
  updated_at: "2026-09-09T00:00:00Z",
};

function textBody(overrides: { updateId?: number; chatId?: number; text?: string } = {}) {
  return JSON.stringify({
    update_id: overrides.updateId ?? 9001,
    message: {
      message_id: 12,
      date: 1710000000,
      chat: { id: overrides.chatId ?? Number(CHAT_ID), type: "private" },
      text: overrides.text ?? "Is the unit available?",
    },
  });
}

function stickerBody() {
  return JSON.stringify({
    update_id: 9002,
    message: {
      message_id: 13,
      date: 1710000000,
      chat: { id: Number(CHAT_ID), type: "private" },
      sticker: { file_id: "sticker" },
    },
  });
}

function secretHeaders(secret = WEBHOOK_SECRET) {
  const headers = new Headers();
  headers.set(TELEGRAM_SECRET_TOKEN_HEADER, secret);
  return headers;
}

interface Store {
  account: ChannelAccount;
  identities: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  refs: Record<string, unknown>[];
  persistError?: { code?: string; message: string } | null;
  claimedProviderIds?: Set<string>;
}

function persistInboundViaRpc(store: Store, args: Record<string, unknown>) {
  const providerMessageId = String(args.p_provider_message_id);
  const claimed = store.claimedProviderIds ?? new Set<string>();
  store.claimedProviderIds = claimed;
  const existing = store.refs.find((row) => row.provider_message_id === providerMessageId);
  if (existing) {
    return {
      data: [
        {
          message_id: existing.message_id,
          conversation_id: existing.conversation_id ?? CONV_1,
          channel_identity_id: existing.channel_identity_id,
          created: false,
        },
      ],
      error: null,
    };
  }
  claimed.add(providerMessageId);
  store.messages.push({
    id: MSG_1,
    organization_id: args.p_organization_id,
    conversation_id: args.p_conversation_id,
    author_user_id: null,
    author_type: "customer",
    channel_identity_id: args.p_channel_identity_id,
    direction: "inbound",
    body: args.p_body,
  });
  store.refs.push({
    message_id: MSG_1,
    conversation_id: args.p_conversation_id,
    channel_identity_id: args.p_channel_identity_id,
    provider_message_id: providerMessageId,
  });
  return {
    data: [
      {
        message_id: MSG_1,
        conversation_id: args.p_conversation_id,
        channel_identity_id: args.p_channel_identity_id,
        created: true,
      },
    ],
    error: null,
  };
}

function installStore(store: Store) {
  if (!store.claimedProviderIds) {
    store.claimedProviderIds = new Set(
      store.refs
        .map((row) => row.provider_message_id)
        .filter((id): id is string => typeof id === "string")
    );
  }
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "channel_accounts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: store.account,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "channel_account_secrets") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { webhook_secret: WEBHOOK_SECRET },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "channel_identities") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: store.identities[0] ?? null,
                  error: null,
                }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const created = { id: IDENTITY_ID, lead_id: LEAD_ID, ...row };
                store.identities.push(created);
                return { data: created, error: null };
              }),
            }),
          })),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: store.identities[0],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "leads") {
        return {
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const created = { id: LEAD_ID, ...row };
                store.leads.push(created);
                return { data: created, error: null };
              }),
            }),
          })),
        };
      }
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data:
                        store.conversations.find((row) => row.status === "open") ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const created = {
                  id: store.conversations.length ? CONV_2 : CONV_1,
                  ...row,
                };
                store.conversations.push(created);
                return { data: created, error: null };
              }),
            }),
          })),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: store.messages[0]
                  ? {
                      id: store.messages[0].id,
                      conversation_id: store.messages[0].conversation_id,
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "channel_message_refs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: store.refs[0]
                      ? {
                          message_id: store.refs[0].message_id,
                          channel_identity_id: store.refs[0].channel_identity_id,
                        }
                      : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
    rpc: vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== "persist_channel_inbound") {
        return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
      }
      if (store.persistError) {
        return Promise.resolve({ data: null, error: store.persistError });
      }
      return Promise.resolve(persistInboundViaRpc(store, args));
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function emptyStore(accountOverrides: Partial<ChannelAccount> = {}): Store {
  return {
    account: { ...account, ...accountOverrides },
    identities: [],
    leads: [],
    conversations: [],
    messages: [],
    refs: [],
  };
}

describe("Telegram ingest contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enqueueAiExecutionJob).mockResolvedValue(undefined);
  });

  it("persists one inbound message, ref, and channel_ingress job", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = textBody();
    const result = await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: secretHeaders(),
    });

    expect(result).toEqual({ accepted: true });
    expect(store.messages).toHaveLength(1);
    expect(store.refs).toHaveLength(1);
    expect(store.identities[0]).toEqual(
      expect.objectContaining({ external_address: CHAT_ID })
    );
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        userId: null,
        triggerSource: "channel_ingress",
        inboundMessageId: MSG_1,
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("ignores stickers without persisting or enqueueing", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = stickerBody();
    const result = await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: secretHeaders(),
    });
    expect(result).toEqual({ accepted: true });
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not duplicate the inbound message for the same Telegram update_id", async () => {
    const store = emptyStore();
    store.messages = [{ id: MSG_1, conversation_id: CONV_1, organization_id: ORG_A }];
    store.refs = [
      {
        message_id: MSG_1,
        conversation_id: CONV_1,
        channel_identity_id: IDENTITY_ID,
        provider_message_id: "9001",
      },
    ];
    installStore(store);
    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: textBody(),
      headers: secretHeaders(),
    });
    expect(store.messages).toHaveLength(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("reuses the same identity for the same Telegram chat", async () => {
    const store = emptyStore();
    store.identities = [
      {
        id: IDENTITY_ID,
        organization_id: ORG_A,
        channel_account_id: ACCOUNT_ID,
        external_address: CHAT_ID,
        lead_id: LEAD_ID,
      },
    ];
    store.leads = [{ id: LEAD_ID, organization_id: ORG_A }];
    store.conversations = [
      {
        id: CONV_1,
        organization_id: ORG_A,
        lead_id: LEAD_ID,
        channel_identity_id: IDENTITY_ID,
        channel_account_id: ACCOUNT_ID,
        status: "open",
        channel: "telegram",
      },
    ];
    installStore(store);
    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: textBody(),
      headers: secretHeaders(),
    });
    expect(store.identities).toHaveLength(1);
    expect(store.conversations).toHaveLength(1);
  });

  it("rejects a missing or invalid secret token", async () => {
    const store = emptyStore();
    installStore(store);
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: textBody(),
        headers: new Headers(),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: textBody(),
        headers: secretHeaders("t".repeat(64)),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });
});
