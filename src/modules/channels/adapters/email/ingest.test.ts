/**
 * Email inbound ingest contract. Generic persistence; adapter verifies, parses,
 * and fetches Receiving API text. Tests inject fetch at the HTTP boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { processConversationMessage } from "@/modules/ai/service";
import { ingestChannelWebhook } from "@/modules/channels/ingest";
import {
  decodeSvixSecret,
  signSvixWebhook,
} from "@/modules/channels/adapters/email/signature";
import {
  EMAIL_SVIX_ID_HEADER,
  EMAIL_SVIX_SIGNATURE_HEADER,
  EMAIL_SVIX_TIMESTAMP_HEADER,
  resendReceivingEmailUrl,
} from "@/modules/channels/adapters/email/constants";
import type { ChannelAccount } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";
const MAILBOX = "sales@acme.example";
const SVIX_KEY = Buffer.from("0123456789abcdefghijklmn");
const SVIX_SECRET = `whsec_${SVIX_KEY.toString("base64")}`;
const ACCESS_TOKEN = "re_" + "x".repeat(40);
const SVIX_MSG_ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const EMAIL_ID = "56761188-7520-42d8-8898-ff6fc54ce618";
const TIMESTAMP = String(Math.floor(Date.now() / 1000));
const SENDER = "buyer@example.com";

const account: ChannelAccount = {
  id: ACCOUNT_ID,
  organization_id: ORG_A,
  channel: "email",
  status: "active",
  provider_destination_id: MAILBOX,
  created_by_user_id: "00000000-0000-4000-8000-000000000001",
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

function receivedBody(overrides: {
  id?: string;
  from?: string;
  to?: string | string[];
  organizationId?: string;
  userId?: string;
  leadId?: string;
} = {}) {
  const to = overrides.to ?? MAILBOX;
  return JSON.stringify({
    type: "email.received",
    created_at: "2026-08-27T13:00:00.000Z",
    organizationId: overrides.organizationId,
    userId: overrides.userId,
    leadId: overrides.leadId,
    data: {
      email_id: overrides.id ?? EMAIL_ID,
      from: overrides.from ?? SENDER,
      to: Array.isArray(to) ? to : [to],
    },
  });
}

function signedHeaders(rawBody: string) {
  const key = decodeSvixSecret(SVIX_SECRET);
  if (!key) {
    throw new Error("test secret must decode");
  }
  const digest = signSvixWebhook(key, SVIX_MSG_ID, TIMESTAMP, rawBody);
  const headers = new Headers();
  headers.set(EMAIL_SVIX_ID_HEADER, SVIX_MSG_ID);
  headers.set(EMAIL_SVIX_TIMESTAMP_HEADER, TIMESTAMP);
  headers.set(EMAIL_SVIX_SIGNATURE_HEADER, `v1,${digest}`);
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
                  data: {
                    webhook_secret: SVIX_SECRET,
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

describe("Email ingest contract", () => {
  const fetchImpl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchImpl);
    vi.mocked(enqueueAiExecutionJob).mockResolvedValue(undefined);
    fetchImpl.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ text: "Is the unit available?" }), {
          status: 200,
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists one inbound customer message and enqueues channel_ingress", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody({ organizationId: ORG_B, userId: "spoof", leadId: "spoof" });

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
    expect(store.refs).toHaveLength(1);
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(resendReceivingEmailUrl(EMAIL_ID));
    expect(url).not.toContain(ACCESS_TOKEN);
  });

  it("ignores delivered events without persisting or enqueueing", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = JSON.stringify({ type: "email.delivered", data: {} });
    const result = await ingestChannelWebhook({
      channelAccountId: ACCOUNT_ID,
      rawBody,
      headers: signedHeaders(rawBody),
    });
    expect(result).toEqual({ accepted: true });
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reuses the inbound ref for a duplicate provider email_id", async () => {
    const store = emptyStore();
    store.messages = [{ id: MSG_1, conversation_id: CONV_1, organization_id: ORG_A }];
    store.refs = [
      {
        message_id: MSG_1,
        conversation_id: CONV_1,
        channel_identity_id: IDENTITY_ID,
        provider_message_id: EMAIL_ID,
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
      expect.objectContaining({ provider_message_id: EMAIL_ID })
    );
    // Duplicate webhooks re-enqueue channel_ingress (at-least-once jobs).
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(2);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("rejects a destination that does not match the account mailbox", async () => {
    const store = emptyStore();
    installStore(store);
    const rawBody = receivedBody({ to: "other@example.com" });
    await expect(
      ingestChannelWebhook({
        channelAccountId: ACCOUNT_ID,
        rawBody,
        headers: signedHeaders(rawBody),
      })
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(store.messages).toHaveLength(0);
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
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
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-email account", async () => {
    const store = emptyStore({ channel: "whatsapp" });
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
