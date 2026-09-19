/**
 * SMS inbound ingest contract. Generic persistence; adapter verifies Ed25519
 * and parses. Tests do not call Telnyx HTTP.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { AuthenticationError, ValidationError } from "@/lib/errors";

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
vi.mock("@/modules/channels/delivery/worker", () => ({
  processDueChannelDeliveryJobs: vi.fn(),
}));
vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { processConversationMessage } from "@/modules/ai/service";
import { ingestChannelWebhook } from "@/modules/channels/ingest";
import {
  SMS_SIGNATURE_HEADER,
  SMS_TIMESTAMP_HEADER,
} from "@/modules/channels/adapters/sms/constants";
import {
  signTelnyxWebhook,
  telnyxPublicKeyToBase64,
} from "@/modules/channels/adapters/sms/signature";
import type { ChannelAccount } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";
const DEST = "+17735550001";
const FROM = "+17735550002";
const PROVIDER_ID = "403193d5-6802-43c2-bd39-10487abff809";
const ACCESS_TOKEN = "KEY" + "x".repeat(40);
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_KEY = telnyxPublicKeyToBase64(publicKey);

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "sms",
  status: "active",
  provider_destination_id: DEST,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
};

function receivedBody(overrides: {
  id?: string;
  from?: string;
  to?: string;
  text?: string;
  type?: string;
  eventType?: string;
  organizationId?: string;
  organization_id?: string;
  userId?: string;
  leadId?: string;
} = {}) {
  return JSON.stringify({
    organizationId: overrides.organizationId,
    userId: overrides.userId,
    leadId: overrides.leadId,
    data: {
      event_type: overrides.eventType ?? "message.received",
      id: "webhook-event-id-must-not-be-used",
      occurred_at: "2026-08-28T13:00:00.000Z",
      payload: {
        id: overrides.id ?? PROVIDER_ID,
        organization_id: overrides.organization_id ?? "telnyx-org-spoof",
        type: overrides.type ?? "SMS",
        text: overrides.text ?? "Is the unit available?",
        from: { phone_number: overrides.from ?? FROM },
        to: [{ phone_number: overrides.to ?? DEST }],
      },
    },
  });
}

function signedHeaders(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = new Headers();
  headers.set(SMS_TIMESTAMP_HEADER, timestamp);
  headers.set(SMS_SIGNATURE_HEADER, signTelnyxWebhook(privateKey, timestamp, rawBody));
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
  claimed.add(providerMessageId);
  const messageId = store.messages.length ? `${MSG_1}-2` : MSG_1;
  store.messages.push({
    id: messageId,
    organization_id: args.p_organization_id,
    conversation_id: args.p_conversation_id,
    author_user_id: null,
    author_type: "customer",
    channel_identity_id: args.p_channel_identity_id,
    direction: "inbound",
    body: args.p_body,
  });
  store.refs.push({
    message_id: messageId,
    conversation_id: args.p_conversation_id,
    channel_identity_id: args.p_channel_identity_id,
    provider_message_id: providerMessageId,
  });
  return {
    data: [
      {
        message_id: messageId,
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
                  data: {
                    webhook_secret: PUBLIC_KEY,
                    provider_access_token: ACCESS_TOKEN,
                    webhook_verify_token: null,
                  },
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
                        store.conversations.find((row) => row.status === "open") ??
                        null,
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
            eq: vi.fn().mockImplementation((_col: string, messageId: unknown) => ({
              maybeSingle: vi.fn().mockImplementation(async () => {
                const match = store.messages.find((row) => row.id === messageId);
                return {
                  data: match
                    ? {
                        id: match.id,
                        conversation_id: match.conversation_id,
                      }
                    : null,
                  error: null,
                };
              }),
            })),
          }),
        };
      }
      if (table === "channel_message_refs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, providerMessageId: unknown) => ({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    const match = store.refs.find(
                      (row) => row.provider_message_id === providerMessageId
                    );
                    return {
                      data: match
                        ? {
                            message_id: match.message_id,
                            channel_identity_id: match.channel_identity_id,
                          }
                        : null,
                      error: null,
                    };
                  }),
                }),
              })),
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

describe("SMS ingest contract", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchImpl);
    vi.mocked(enqueueAiExecutionJob).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists one inbound customer message using payload.id and enqueues channel_ingress", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody({
      organizationId: ORG_B,
      organization_id: "telnyx-foreign-org",
      userId: "spoof-user",
      leadId: "spoof-lead",
    });

    const result = await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: signedHeaders(rawBody),
    });

    expect(result).toEqual({ accepted: true });
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toEqual(
      expect.objectContaining({
        organization_id: ORG_A,
        author_type: "customer",
        direction: "inbound",
        body: "Is the unit available?",
      })
    );
    expect(store.refs[0]).toEqual(
      expect.objectContaining({ provider_message_id: PROVIDER_ID })
    );
    expect(store.refs[0]?.provider_message_id).not.toBe(
      "webhook-event-id-must-not-be-used"
    );
    expect(store.leads[0]).toEqual(
      expect.objectContaining({
        organization_id: ORG_A,
        first_name: "Unknown",
        last_name: "Customer",
      })
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
    expect(JSON.stringify(store.leads)).not.toContain(ORG_B);
    expect(JSON.stringify(store.messages)).not.toContain(ORG_B);
    expect(JSON.stringify(store.messages)).not.toContain("spoof-user");
    expect(JSON.stringify(store.messages)).not.toContain("spoof-lead");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ignores signed MMS and empty text without persisting or enqueueing", async () => {
    const store = emptyStore();
    installStore(store);
    const mms = receivedBody({ type: "MMS", text: "photo" });
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: mms,
        headers: signedHeaders(mms),
      })
    ).resolves.toEqual({ accepted: true });
    const empty = receivedBody({ text: "   " });
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody: empty,
        headers: signedHeaders(empty),
      })
    ).resolves.toEqual({ accepted: true });
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("reuses the inbound ref for a duplicate Telnyx message id", async () => {
    const store = emptyStore();
    store.messages = [{ id: MSG_1, conversation_id: CONV_1, organization_id: ORG_A }];
    store.refs = [
      {
        message_id: MSG_1,
        conversation_id: CONV_1,
        channel_identity_id: IDENTITY_ID,
        provider_message_id: PROVIDER_ID,
      },
    ];
    installStore(store);
    const rawBody = receivedBody();
    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: signedHeaders(rawBody),
    });
    expect(store.messages).toHaveLength(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not duplicate the message when the same signed webhook is ingested twice", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody();
    const headers = signedHeaders(rawBody);

    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers,
    });
    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers,
    });

    expect(store.messages).toHaveLength(1);
    expect(store.refs).toHaveLength(1);
    expect(store.refs[0]).toEqual(
      expect.objectContaining({ provider_message_id: PROVIDER_ID })
    );
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(2);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("persists a new inbound when Telnyx message id changes", async () => {
    const store = emptyStore();
    store.messages = [{ id: MSG_1, conversation_id: CONV_1, organization_id: ORG_A }];
    store.refs = [
      {
        message_id: MSG_1,
        conversation_id: CONV_1,
        channel_identity_id: IDENTITY_ID,
        provider_message_id: PROVIDER_ID,
      },
    ];
    store.identities = [{ id: IDENTITY_ID, lead_id: LEAD_ID }];
    store.conversations = [{ id: CONV_1, status: "open" }];
    installStore(store);
    const rawBody = receivedBody({ id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
    await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: signedHeaders(rawBody),
    });
    expect(store.messages).toHaveLength(2);
    expect(store.refs[1]).toEqual(
      expect.objectContaining({
        provider_message_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      })
    );
  });

  it("rejects a destination that does not match the account number", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody({ to: "+17735550999" });
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("rejects an inactive account", async () => {
    const store = emptyStore({ status: "paused" });
    installStore(store);
    const rawBody = receivedBody();
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("rejects a non-SMS account", async () => {
    const store = emptyStore({ channel: "email" });
    installStore(store);
    const rawBody = receivedBody();
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("returns 422 for malformed received metadata after a valid signature", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody({ from: "" });
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });
});
