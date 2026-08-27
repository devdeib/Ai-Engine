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
});
