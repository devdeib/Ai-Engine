import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEmailDeliveryAdapter } from "@/modules/channels/adapters/email/delivery";
import { EMAIL_SEND_NOT_IMPLEMENTED } from "@/modules/channels/adapters/email/constants";

describe("email delivery adapter (5.3A)", () => {
  it("does not perform live HTTP", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/channels/adapters/email/delivery.ts"),
      "utf8"
    );
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("globalThis.fetch");
  });

  it("fails closed when credentials are missing", async () => {
    const adapter = createEmailDeliveryAdapter({
      loadCredentials: vi.fn().mockResolvedValue(null),
    });
    await expect(
      adapter.send({
        organizationId: "aaaaaaaa-0000-0000-0000-000000000001",
        channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        channelIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        messageId: "msg-1",
        destination: "buyer@example.com",
        body: "Hello",
        idempotencyKey: "msg-1",
      })
    ).resolves.toEqual({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
      retryable: false,
    });
  });

  it("does not send when credentials exist; 5.3B owns HTTP", async () => {
    const adapter = createEmailDeliveryAdapter({
      loadCredentials: vi.fn().mockResolvedValue({
        accessToken: "re_test",
        mailbox: "sales@acme.example",
      }),
    });
    const result = await adapter.send({
      organizationId: "aaaaaaaa-0000-0000-0000-000000000001",
      channelAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      channelIdentityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      messageId: "msg-1",
      destination: "buyer@example.com",
      body: "Hello",
      idempotencyKey: "msg-1",
    });
    expect(result).toEqual({
      ok: false,
      errorCode: EMAIL_SEND_NOT_IMPLEMENTED,
      retryable: false,
    });
  });
});
