/**
 * Signed test webhook ingest tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuthenticationError } from "@/lib/errors";
import { decideAiAction } from "@/modules/ai/decisions";

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
vi.mock("@/modules/channels/verify", () => ({
  verifyTestChannelWebhook: vi.fn(),
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
vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { verifyTestChannelWebhook } from "@/modules/channels/verify";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { ingestTestWebhook } from "@/modules/channels/ingest";
import type { ChannelAccount } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "test",
  status: "active",
  provider_destination_id: "dest-1",
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    providerMessageId: "prov-1",
    from: "+9745550001",
    to: "dest-1",
    body: "Is the unit available?",
    ...overrides,
  });
}

interface Store {
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

  const existing = store.refs.find(
    (row) => row.provider_message_id === providerMessageId
  );
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

  if (claimed.has(providerMessageId)) {
    const winner = store.refs.find(
      (row) => row.provider_message_id === providerMessageId
    );
    return {
      data: [
        {
          message_id: winner?.message_id ?? MSG_1,
          conversation_id: winner?.conversation_id ?? CONV_1,
          channel_identity_id: winner?.channel_identity_id ?? IDENTITY_ID,
          created: false,
        },
      ],
      error: null,
    };
  }

  claimed.add(providerMessageId);
  const created = {
    id: MSG_1,
    organization_id: args.p_organization_id,
    conversation_id: args.p_conversation_id,
    author_user_id: null,
    author_type: "customer",
    channel_identity_id: args.p_channel_identity_id,
    direction: "inbound",
    body: args.p_body,
  };
  store.messages.push(created);
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
                data: {
                  id: ACCOUNT_ID,
                  organization_id: ORG_A,
                  channel: "test",
                  status: "active",
                  provider_destination_id: "dest-1",
                  created_by_user_id: "00000000-0000-4000-8000-000000000001",
                  created_at: "2026-08-27T00:00:00Z",
                  updated_at: "2026-08-27T00:00:00Z",
                },
                error: null,
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
                        store.conversations.find(
                          (row) => row.status === "open"
                        ) ?? null,
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
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(async () => {
                const created = { id: MSG_1, ...row };
                store.messages.push(created);
                return { data: created, error: null };
              }),
            }),
          })),
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
          insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
            const duplicate = store.refs.some(
              (existing) =>
                existing.provider_message_id === row.provider_message_id
            );
            if (duplicate) {
              return Promise.resolve({
                error: { code: "23505", message: "duplicate key" },
              });
            }
            store.refs.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return {};
    }),
    rpc: vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name !== "persist_channel_inbound") {
        return Promise.resolve({
          data: null,
          error: { message: "unknown rpc" },
        });
      }
      if (store.persistError) {
        return Promise.resolve({ data: null, error: store.persistError });
      }
      return Promise.resolve(persistInboundViaRpc(store, args));
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

describe("ingestTestWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyTestChannelWebhook).mockResolvedValue(account);
    vi.mocked(enqueueAiExecutionJob).mockResolvedValue(undefined);
  });

  it("creates a stub lead, identity, conversation, customer message, and channel_ingress job", async () => {
    const store: Store = {
      identities: [],
      leads: [],
      conversations: [],
      messages: [],
      refs: [],
    };
    installStore(store);

    const result = await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload({
        organizationId: ORG_B,
        userId: "ffffffff-0000-4000-8000-000000000099",
        leadId: "99999999-9999-4999-8999-999999999999",
      }),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(result).toEqual({ accepted: true });
    expect(store.leads[0]).toEqual(
      expect.objectContaining({
        organization_id: ORG_A,
        first_name: "Unknown",
        last_name: "Customer",
        source: "other",
        status: "new",
      })
    );
    expect(store.leads[0]).not.toHaveProperty("organization_id", ORG_B);
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        author_type: "customer",
        author_user_id: null,
        direction: "inbound",
        organization_id: ORG_A,
      })
    );
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: null,
      conversationId: CONV_1,
      inboundMessageId: MSG_1,
      triggerSource: "channel_ingress",
      channelIdentityId: IDENTITY_ID,
    });
    expect(JSON.stringify(store)).not.toContain(ORG_B);
  });

  it("returns 200 without a second message or job row for a duplicate provider id", async () => {
    const store: Store = {
      identities: [],
      leads: [],
      conversations: [],
      messages: [
        { id: MSG_1, conversation_id: CONV_1, organization_id: ORG_A },
      ],
      refs: [
        {
          message_id: MSG_1,
          channel_identity_id: IDENTITY_ID,
          provider_message_id: "prov-1",
        },
      ],
    };
    installStore(store);

    await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload(),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(store.messages).toHaveLength(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessageId: MSG_1,
        triggerSource: "channel_ingress",
        userId: null,
      })
    );
  });

  it("opens a new conversation when the previous external thread is closed", async () => {
    const store: Store = {
      identities: [
        {
          id: IDENTITY_ID,
          organization_id: ORG_A,
          channel_account_id: ACCOUNT_ID,
          external_address: "+9745550001",
          lead_id: LEAD_ID,
        },
      ],
      leads: [{ id: LEAD_ID, organization_id: ORG_A }],
      conversations: [
        {
          id: CONV_1,
          organization_id: ORG_A,
          channel_identity_id: IDENTITY_ID,
          status: "closed",
          channel: "test",
        },
      ],
      messages: [],
      refs: [],
    };
    installStore(store);

    await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload(),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(store.conversations).toHaveLength(2);
    expect(store.conversations[0]?.status).toBe("closed");
    expect(store.conversations[1]).toEqual(
      expect.objectContaining({
        id: CONV_2,
        organization_id: ORG_A,
        lead_id: LEAD_ID,
        channel: "test",
        channel_account_id: ACCOUNT_ID,
        channel_identity_id: IDENTITY_ID,
      })
    );
  });

  it("rejects a destination that does not match the trusted account", async () => {
    installStore({
      identities: [],
      leads: [],
      conversations: [],
      messages: [],
      refs: [],
    });
    await expect(
      ingestTestWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: payload({ to: "other-dest" }),
        timestampHeader: "1",
        signatureHeader: "sig",
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("does not apply AI eligibility inside ingest", () => {
    const ingest = readFileSync(
      resolve(process.cwd(), "src/modules/channels/ingest.ts"),
      "utf8"
    );
    expect(ingest).not.toContain("decideAiAction");
    expect(ingest).not.toContain("ai_paused_at");
    expect(ingest).not.toContain("requires_human");
    expect(ingest).not.toContain("processConversationMessage");
    expect(ingest).toContain("persist_channel_inbound");
  });

  it("persists customer inbound on a paused conversation and still enqueues AI", async () => {
    const store = existingOpenThreadStore({
      ai_paused_at: "2026-08-27T10:00:00Z",
      requires_human: false,
    });
    installStore(store);

    const result = await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload(),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(result).toEqual({ accepted: true });
    expect(store.identities).toHaveLength(1);
    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]).toEqual(
      expect.objectContaining({
        id: CONV_1,
        status: "open",
        ai_paused_at: "2026-08-27T10:00:00Z",
      })
    );
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        author_type: "customer",
        author_user_id: null,
        direction: "inbound",
        conversation_id: CONV_1,
        organization_id: ORG_A,
        body: "Is the unit available?",
      })
    );
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: null,
      conversationId: CONV_1,
      inboundMessageId: MSG_1,
      triggerSource: "channel_ingress",
      channelIdentityId: IDENTITY_ID,
    });
    expect(
      decideAiAction({
        conversation: {
          status: "open",
          requires_human: false,
          ai_paused_at: "2026-08-27T10:00:00Z",
        },
        messages: [
          {
            id: MSG_1,
            direction: "inbound",
            in_reply_to_message_id: null,
          },
        ],
      })
    ).toEqual({ action: "skip", reason: "paused" });
  });

  it("persists customer inbound when requires_human is set and still enqueues AI", async () => {
    const store = existingOpenThreadStore({
      ai_paused_at: null,
      requires_human: true,
    });
    installStore(store);

    await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload(),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(store.identities).toHaveLength(1);
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        author_type: "customer",
        direction: "inbound",
        conversation_id: CONV_1,
      })
    );
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(
      decideAiAction({
        conversation: {
          status: "open",
          requires_human: true,
          ai_paused_at: null,
        },
        messages: [
          {
            id: MSG_1,
            direction: "inbound",
            in_reply_to_message_id: null,
          },
        ],
      })
    ).toEqual({ action: "skip", reason: "requires_human" });
  });

  it("converges concurrent duplicate provider ids onto one message, ref, and job identity", async () => {
    // Vitest has no live Postgres; this exercises unique-first persist_channel_inbound
    // semantics. True concurrent unique_violation is enforced by the SQL function.
    const store = existingOpenThreadStore({});
    installStore(store);

    const request = () =>
      ingestTestWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: payload(),
        timestampHeader: "1",
        signatureHeader: "sig",
      });

    const [first, second] = await Promise.all([request(), request()]);

    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: true });
    expect(store.messages).toHaveLength(1);
    expect(store.refs).toHaveLength(1);
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        id: MSG_1,
        author_type: "customer",
        direction: "inbound",
      })
    );
    expect(store.refs[0]).toEqual(
      expect.objectContaining({
        message_id: MSG_1,
        provider_message_id: "prov-1",
      })
    );
    const inboundIds = vi
      .mocked(enqueueAiExecutionJob)
      .mock.calls.map((call) => call[0]?.inboundMessageId);
    expect(inboundIds).toEqual([MSG_1, MSG_1]);
  });

  it("does not leave a retryable duplicate after persist failure", async () => {
    const store = existingOpenThreadStore({});
    store.persistError = { message: "persist failed" };
    installStore(store);

    await expect(
      ingestTestWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: payload(),
        timestampHeader: "1",
        signatureHeader: "sig",
      })
    ).rejects.toThrow("Failed to persist inbound channel message");

    expect(store.messages).toHaveLength(0);
    expect(store.refs).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();

    store.persistError = null;
    await ingestTestWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody: payload(),
      timestampHeader: "1",
      signatureHeader: "sig",
    });

    expect(store.messages).toHaveLength(1);
    expect(store.refs).toHaveLength(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith(
      expect.objectContaining({ inboundMessageId: MSG_1 })
    );
  });

  it("does not acknowledge the webhook when AI job enqueue fails after persist", async () => {
    const store = existingOpenThreadStore({});
    installStore(store);
    vi.mocked(enqueueAiExecutionJob).mockRejectedValue(
      new Error("Failed to enqueue AI execution job")
    );

    await expect(
      ingestTestWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: payload(),
        timestampHeader: "1",
        signatureHeader: "sig",
      })
    ).rejects.toThrow("Failed to enqueue AI execution job");

    expect(store.messages).toHaveLength(1);
    expect(store.refs).toHaveLength(1);
  });
});

function existingOpenThreadStore(
  conversationExtras: Record<string, unknown>
): Store {
  return {
    identities: [
      {
        id: IDENTITY_ID,
        organization_id: ORG_A,
        channel_account_id: ACCOUNT_ID,
        external_address: "+9745550001",
        lead_id: LEAD_ID,
      },
    ],
    leads: [{ id: LEAD_ID, organization_id: ORG_A }],
    conversations: [
      {
        id: CONV_1,
        organization_id: ORG_A,
        lead_id: LEAD_ID,
        channel_identity_id: IDENTITY_ID,
        channel_account_id: ACCOUNT_ID,
        status: "open",
        channel: "test",
        requires_human: false,
        ai_paused_at: null,
        ...conversationExtras,
      },
    ],
    messages: [],
    refs: [],
  };
}
