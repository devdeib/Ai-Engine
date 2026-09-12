import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { testWebhookPayloadSchema } from "@/modules/channels/schema";

describe("test webhook payload schema", () => {
  it("strips tenant identity fields supplied by the payload", () => {
    const parsed = testWebhookPayloadSchema.safeParse({
      providerMessageId: "msg-1",
      from: "+9745550001",
      to: "test-dest",
      body: "Hello",
      organizationId: "bbbbbbbb-0000-0000-0000-000000000002",
      userId: "ffffffff-0000-4000-8000-000000000099",
      leadId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        providerMessageId: "msg-1",
        from: "+9745550001",
        to: "test-dest",
        body: "Hello",
      });
      expect("organizationId" in parsed.data).toBe(false);
      expect("userId" in parsed.data).toBe(false);
      expect("leadId" in parsed.data).toBe(false);
    }
  });
});

describe("channel ingest source contract", () => {
  it("does not import AI execution authorities", () => {
    const ingest = readFileSync(
      resolve(process.cwd(), "src/modules/channels/ingest.ts"),
      "utf8"
    );
    const verify = readFileSync(
      resolve(process.cwd(), "src/modules/channels/verify.ts"),
      "utf8"
    );
    const loopback = readFileSync(
      resolve(process.cwd(), "src/modules/channels/delivery/loopback.ts"),
      "utf8"
    );
    const deliveryWorker = readFileSync(
      resolve(process.cwd(), "src/modules/channels/delivery/worker.ts"),
      "utf8"
    );
    const webhook = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/v1/channels/accounts/[channelAccountId]/webhook/route.ts"
      ),
      "utf8"
    );
    const inboundAdapter = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/test-inbound.ts"),
      "utf8"
    );
    const deliveryAdapter = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/test-delivery.ts"),
      "utf8"
    );
    const registry = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/registry.ts"),
      "utf8"
    );
    const whatsappInbound = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/whatsapp/inbound.ts"),
      "utf8"
    );
    const whatsappDelivery = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/whatsapp/delivery.ts"),
      "utf8"
    );
    const whatsappChallenge = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/whatsapp/challenge.ts"),
      "utf8"
    );
    const emailInbound = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/email/inbound.ts"),
      "utf8"
    );
    const emailDelivery = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/email/delivery.ts"),
      "utf8"
    );
    const smsInbound = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/inbound.ts"),
      "utf8"
    );
    const smsDelivery = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/delivery.ts"),
      "utf8"
    );
    const telegramInbound = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/telegram/inbound.ts"),
      "utf8"
    );
    const telegramDelivery = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/telegram/delivery.ts"),
      "utf8"
    );
    const telegramSetup = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/telegram/setup.ts"),
      "utf8"
    );
    const secrets = readFileSync(
      resolve(process.cwd(), "src/modules/channels/secrets.ts"),
      "utf8"
    );
    const forbiddenImports = [
      'from "@/modules/ai/service"',
      "executeFromRecommendation",
      "approveAiToolAction",
      "escalateToHuman",
      "resumeAI",
    ];
    for (const source of [
      ingest,
      verify,
      loopback,
      deliveryWorker,
      webhook,
      inboundAdapter,
      deliveryAdapter,
      registry,
      whatsappInbound,
      whatsappDelivery,
      whatsappChallenge,
      emailInbound,
      emailDelivery,
      smsInbound,
      smsDelivery,
      telegramInbound,
      telegramDelivery,
      telegramSetup,
      secrets,
    ]) {
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("processConversationMessage");
      expect(code).not.toContain("from \"@/modules/ai/recommendation/policy\"");
      expect(code).not.toContain('{ kind: "channel_ingress" }');
      for (const token of forbiddenImports) {
        expect(code).not.toContain(token);
      }
    }
  });

  it("loopback adapter has no outbound URL", () => {
    const loopback = readFileSync(
      resolve(process.cwd(), "src/modules/channels/delivery/loopback.ts"),
      "utf8"
    );
    expect(loopback).not.toContain("fetch(");
    expect(loopback).not.toContain("http");
  });

  it("generic delivery worker does not import loopback", () => {
    const deliveryWorker = readFileSync(
      resolve(process.cwd(), "src/modules/channels/delivery/worker.ts"),
      "utf8"
    );
    expect(deliveryWorker).not.toContain("deliverLoopback");
    expect(deliveryWorker).toContain("getDeliveryAdapter");
  });
});

describe("createChannelAccountSchema", () => {
  it("creates a test account from destination only", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    const parsed = createChannelAccountSchema.safeParse({
      provider_destination_id: "dest-1",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.channel).toBe("test");
    }
  });

  it("requires WhatsApp credentials and accepts a long Graph access token", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    const token = "EAAG." + "x".repeat(200);
    expect(
      createChannelAccountSchema.safeParse({
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
      }).success
    ).toBe(false);
    const parsed = createChannelAccountSchema.safeParse({
      channel: "whatsapp",
      provider_destination_id: "123456789012345",
      access_token: token,
      webhook_verify_token: "verify",
      app_secret: "s".repeat(32),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.access_token).toBe(token);
      expect(parsed.data.access_token?.length).toBeGreaterThan(128);
    }
  });

  it("requires Email credentials and does not require WhatsApp fields", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    expect(
      createChannelAccountSchema.safeParse({
        channel: "email",
        provider_destination_id: "sales@acme.example",
      }).success
    ).toBe(false);
    expect(
      createChannelAccountSchema.safeParse({
        channel: "email",
        provider_destination_id: "sales@acme.example",
        access_token: "re_" + "x".repeat(40),
        app_secret: "s".repeat(32),
        webhook_verify_token: "verify",
      }).success
    ).toBe(false);
    const signingSecret = `whsec_${"a".repeat(32)}`;
    const parsed = createChannelAccountSchema.safeParse({
      channel: "email",
      provider_destination_id: "sales@acme.example",
      access_token: "re_" + "x".repeat(40),
      webhook_signing_secret: signingSecret,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.channel).toBe("email");
      expect(parsed.data.webhook_verify_token).toBeUndefined();
    }
  });

  it("does not require Email signing secrets when creating WhatsApp or test accounts", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    expect(
      createChannelAccountSchema.safeParse({
        provider_destination_id: "dest-1",
      }).success
    ).toBe(true);
    expect(
      createChannelAccountSchema.safeParse({
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
        access_token: "EAAG." + "x".repeat(200),
        webhook_verify_token: "verify",
        app_secret: "s".repeat(32),
      }).success
    ).toBe(true);
  });

  it("requires SMS API key and signing public key and does not require a verify token", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    expect(
      createChannelAccountSchema.safeParse({
        channel: "sms",
        provider_destination_id: "+17735550001",
      }).success
    ).toBe(false);
    expect(
      createChannelAccountSchema.safeParse({
        channel: "sms",
        provider_destination_id: "+17735550001",
        access_token: "KEY" + "t".repeat(40),
        webhook_verify_token: "verify",
      }).success
    ).toBe(false);
    const signingSecret = Buffer.alloc(32, 7).toString("base64");
    const parsed = createChannelAccountSchema.safeParse({
      channel: "sms",
      provider_destination_id: "+17735550001",
      access_token: "KEY" + "t".repeat(40),
      webhook_signing_secret: signingSecret,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.channel).toBe("sms");
      expect(parsed.data.webhook_verify_token).toBeUndefined();
    }
  });

  it("does not weaken Email or WhatsApp credential requirements for SMS", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    expect(
      createChannelAccountSchema.safeParse({
        channel: "email",
        provider_destination_id: "sales@acme.example",
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: "p".repeat(44),
      }).success
    ).toBe(false);
    expect(
      createChannelAccountSchema.safeParse({
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
        access_token: "EAAG." + "x".repeat(200),
        app_secret: "s".repeat(32),
      }).success
    ).toBe(false);
  });

  it("requires a Telegram bot token and generates no user-supplied webhook secret", async () => {
    const { createChannelAccountSchema } = await import("@/modules/channels/schema");
    expect(
      createChannelAccountSchema.safeParse({
        channel: "telegram",
        provider_destination_id: "vg_sales_bot",
      }).success
    ).toBe(false);
    const token = "123456:AA" + "x".repeat(30);
    const parsed = createChannelAccountSchema.safeParse({
      channel: "telegram",
      provider_destination_id: "@VG_Sales_Bot",
      access_token: token,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.channel).toBe("telegram");
      expect(parsed.data.access_token).toBe(token);
      expect(parsed.data.webhook_signing_secret).toBeUndefined();
      expect(parsed.data.app_secret).toBeUndefined();
    }
  });
});

describe("updateChannelAccountStatusSchema", () => {
  it("requires status and rejects extra keys", async () => {
    const { updateChannelAccountStatusSchema } = await import(
      "@/modules/channels/schema"
    );
    expect(
      updateChannelAccountStatusSchema.safeParse({ status: "paused" }).success
    ).toBe(true);
    expect(updateChannelAccountStatusSchema.safeParse({}).success).toBe(false);
    expect(
      updateChannelAccountStatusSchema.safeParse({ status: "archived" }).success
    ).toBe(false);
    expect(
      updateChannelAccountStatusSchema.safeParse({
        status: "paused",
        channel: "sms",
      }).success
    ).toBe(false);
  });
});

describe("listChannelIdentitiesQuerySchema", () => {
  const leadId = "11111111-1111-4111-8111-111111111111";
  const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  it("accepts lead_id, unmatched, and existing pagination filters", async () => {
    const { listChannelIdentitiesQuerySchema } = await import(
      "@/modules/channels/schema"
    );

    expect(listChannelIdentitiesQuerySchema.safeParse({}).success).toBe(true);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ lead_id: leadId }).success
    ).toBe(true);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ unmatched: "true" }).success
    ).toBe(true);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ unmatched: "false" }).success
    ).toBe(true);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({
        lead_id: leadId,
        unmatched: "false",
      }).success
    ).toBe(true);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({
        page: "2",
        limit: "100",
        channel_account_id: accountId,
      }).success
    ).toBe(true);

    const parsed = listChannelIdentitiesQuerySchema.safeParse({
      unmatched: "true",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unmatched).toBe(true);
      expect(parsed.data.page).toBe(1);
      expect(parsed.data.limit).toBe(20);
    }
  });

  it("rejects invalid UUID, boolean, pagination, and contradictory filters", async () => {
    const { listChannelIdentitiesQuerySchema } = await import(
      "@/modules/channels/schema"
    );

    expect(
      listChannelIdentitiesQuerySchema.safeParse({ lead_id: "not-a-uuid" })
        .success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ lead_id: null }).success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ unmatched: "yes" }).success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ unmatched: "TRUE" }).success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({
        lead_id: leadId,
        unmatched: "true",
      }).success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ page: "0" }).success
    ).toBe(false);
    expect(
      listChannelIdentitiesQuerySchema.safeParse({ limit: "101" }).success
    ).toBe(false);
  });

  it("strips extra identity keys instead of treating them as query controls", async () => {
    const { listChannelIdentitiesQuerySchema } = await import(
      "@/modules/channels/schema"
    );
    const parsed = listChannelIdentitiesQuerySchema.safeParse({
      lead_id: leadId,
      organizationId: "bbbbbbbb-0000-4000-8000-000000000002",
      channelAccountId: accountId,
      externalAddress: "+9745550001",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.lead_id).toBe(leadId);
      expect(parsed.data).not.toHaveProperty("organizationId");
      expect(parsed.data).not.toHaveProperty("channelAccountId");
      expect(parsed.data).not.toHaveProperty("externalAddress");
      expect(parsed.data).not.toHaveProperty("id");
    }
  });
});

describe("listChannelIdentityMatchCandidatesQuerySchema", () => {
  it("accepts default and max pagination and rejects invalid limits", async () => {
    const { listChannelIdentityMatchCandidatesQuerySchema } = await import(
      "@/modules/channels/schema"
    );
    const defaults = listChannelIdentityMatchCandidatesQuerySchema.safeParse({});
    expect(defaults.success).toBe(true);
    if (defaults.success) {
      expect(defaults.data).toEqual({ page: 1, limit: 20 });
    }
    expect(
      listChannelIdentityMatchCandidatesQuerySchema.safeParse({
        page: "1",
        limit: "100",
      }).success
    ).toBe(true);
    expect(
      listChannelIdentityMatchCandidatesQuerySchema.safeParse({ limit: "101" })
        .success
    ).toBe(false);
    expect(
      listChannelIdentityMatchCandidatesQuerySchema.safeParse({ page: "0" })
        .success
    ).toBe(false);
  });
});

describe("excludeChannelStubsQuerySchema", () => {
  it("accepts true/false and rejects invalid booleans", async () => {
    const { excludeChannelStubsQuerySchema } = await import(
      "@/modules/channels/schema"
    );
    expect(excludeChannelStubsQuerySchema.safeParse("true").success).toBe(true);
    expect(excludeChannelStubsQuerySchema.safeParse("false").success).toBe(
      true
    );
    expect(excludeChannelStubsQuerySchema.safeParse(undefined).success).toBe(
      true
    );
    expect(excludeChannelStubsQuerySchema.safeParse("yes").success).toBe(false);
    expect(excludeChannelStubsQuerySchema.safeParse("1").success).toBe(false);
  });
});

describe("attachChannelIdentityLeadSchema", () => {
  const leadId = "11111111-1111-4111-8111-111111111111";

  it("accepts a valid leadId and rejects invalid bodies", async () => {
    const { attachChannelIdentityLeadSchema } = await import(
      "@/modules/channels/schema"
    );

    expect(
      attachChannelIdentityLeadSchema.safeParse({ leadId }).success
    ).toBe(true);
    expect(attachChannelIdentityLeadSchema.safeParse({}).success).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({ leadId: null }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({ leadId: "not-a-uuid" }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({
        leadId,
        extra: true,
      }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({
        leadId,
        organizationId: "bbbbbbbb-0000-4000-8000-000000000002",
      }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({
        leadId,
        channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({
        leadId,
        externalAddress: "+9745550001",
      }).success
    ).toBe(false);
    expect(
      attachChannelIdentityLeadSchema.safeParse({
        leadId,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }).success
    ).toBe(false);
  });
});

describe("parseChannelAccountRotateBody", () => {
  it("accepts an empty Test body and rejects identity fields", async () => {
    const { parseChannelAccountRotateBody } = await import(
      "@/modules/channels/schema"
    );
    expect(parseChannelAccountRotateBody("test", "dest-1", {}).success).toBe(true);
    expect(
      parseChannelAccountRotateBody("test", "dest-1", { channel: "sms" }).success
    ).toBe(false);
    expect(
      parseChannelAccountRotateBody("test", "dest-1", {
        provider_destination_id: "other",
      }).success
    ).toBe(false);
  });

  it("reuses WhatsApp, Email, and SMS create credential rules", async () => {
    const { parseChannelAccountRotateBody } = await import(
      "@/modules/channels/schema"
    );
    expect(
      parseChannelAccountRotateBody("whatsapp", "123456789012345", {
        access_token: "EAAG." + "x".repeat(80),
        webhook_verify_token: "verify",
        app_secret: "s".repeat(32),
      }).success
    ).toBe(true);
    expect(
      parseChannelAccountRotateBody("email", "sales@acme.example", {
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: `whsec_${"a".repeat(32)}`,
      }).success
    ).toBe(true);
    expect(
      parseChannelAccountRotateBody("email", "sales@acme.example", {
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: "p".repeat(44),
      }).success
    ).toBe(false);
    expect(
      parseChannelAccountRotateBody("sms", "+17735550001", {
        access_token: "KEY" + "t".repeat(40),
        webhook_signing_secret: "p".repeat(44),
      }).success
    ).toBe(true);
    expect(
      parseChannelAccountRotateBody("telegram", "vg_sales_bot", {
        access_token: "123456:AA" + "x".repeat(30),
      }).success
    ).toBe(true);
    expect(
      parseChannelAccountRotateBody("telegram", "vg_sales_bot", {}).success
    ).toBe(false);
  });

  it("rejects Email credentials on SMS and WhatsApp credentials on Email", async () => {
    const { parseChannelAccountRotateBody } = await import(
      "@/modules/channels/schema"
    );
    expect(
      parseChannelAccountRotateBody("sms", "+17735550001", {
        channel: "email",
        provider_destination_id: "sales@acme.example",
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: `whsec_${"a".repeat(32)}`,
      }).success
    ).toBe(false);
    expect(
      parseChannelAccountRotateBody("email", "sales@acme.example", {
        access_token: "EAAG." + "x".repeat(80),
        webhook_verify_token: "verify",
        app_secret: "s".repeat(32),
      }).success
    ).toBe(false);
    expect(
      parseChannelAccountRotateBody("sms", "+17735550001", {
        access_token: "",
        webhook_signing_secret: "",
      }).success
    ).toBe(false);
  });
});

describe("SMS adapter isolation", () => {
  const adapterFiles = [
    "src/modules/channels/adapters/sms/inbound.ts",
    "src/modules/channels/adapters/sms/delivery.ts",
    "src/modules/channels/adapters/sms/parse.ts",
    "src/modules/channels/adapters/sms/signature.ts",
    "src/modules/channels/adapters/sms/errors.ts",
    "src/modules/channels/adapters/sms/constants.ts",
  ];

  it("does not import AI, HITL, CRM persistence, or job enqueue", () => {
    for (const relative of adapterFiles) {
      const source = readFileSync(resolve(process.cwd(), relative), "utf8");
      const code = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("processConversationMessage");
      expect(code).not.toContain("decideAiAction");
      expect(code).not.toContain("escalateToHuman");
      expect(code).not.toContain("resumeAI");
      expect(code).not.toContain("from \"@/modules/ai/");
      expect(code).not.toContain("from \"@/modules/ai/action-center");
      expect(code).not.toContain("persist_channel_inbound");
      expect(code).not.toContain("enqueueAiExecutionJob");
      expect(code).not.toContain("enqueueChannelDelivery");
      expect(code).not.toContain("TELNYX_API_KEY");
      expect(code).not.toContain("process.env");
    }
  });

  it("SMS inbound performs no HTTP and delivery uses fetch against Telnyx only", () => {
    const inbound = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/inbound.ts"),
      "utf8"
    );
    const delivery = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/sms/delivery.ts"),
      "utf8"
    );
    expect(inbound).not.toContain("fetch(");
    expect(inbound).not.toContain("telnyx.com");
    expect(delivery).toContain("fetchFn");
    expect(delivery).toContain("globalThis.fetch");
    expect(delivery).toContain("api.telnyx.com");
    expect(delivery).not.toContain("TELNYX_API_KEY");
    expect(inbound).not.toContain("TELNYX_API_KEY");
  });
});
