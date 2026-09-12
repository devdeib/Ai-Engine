import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
  requireOrgRole: vi.fn(),
}));
vi.mock("@/modules/channels/hmac", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/channels/hmac")>();
  return {
    ...actual,
    generateChannelWebhookSecret: vi.fn(() => "s".repeat(64)),
  };
});
vi.mock("@/modules/channels/adapters/telegram/setup", () => ({
  registerTelegramWebhook: vi.fn().mockResolvedValue({ ok: true }),
  setupTelegramChannelWebhook: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireOrgMembership,
  requireOrgRole,
} from "@/modules/organizations/queries";
import { generateChannelWebhookSecret } from "@/modules/channels/hmac";
import { registerTelegramWebhook } from "@/modules/channels/adapters/telegram/setup";
import { logger } from "@/lib/logger";
import {
  createTestChannelAccount,
  listChannelAccounts,
  getChannelAccount,
  createChannelAccount,
  updateChannelAccountStatus,
  rotateChannelAccountSecrets,
} from "@/modules/channels/accounts";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";

describe("createTestChannelAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns the secret once and stores it off the public account row", async () => {
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "test",
            status: "active",
            provider_destination_id: "dest-1",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createTestChannelAccount(ORG_A, USER_1, {
      provider_destination_id: "Dest-1",
    });
    expect(created.webhookSecret).toBe("s".repeat(64));
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: "s".repeat(64),
    });
    expect(JSON.stringify(insertAccount.mock.calls[0]?.[0])).not.toContain("webhook");
  });

  it("rolls back the account in-organization when secret insert fails", async () => {
    const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: accountId,
            organization_id: ORG_A,
            channel: "test",
            status: "active",
            provider_destination_id: "dest-1",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({
      error: { code: "40001", message: "secret insert failed" },
    });
    const deleteEqOrg = vi.fn().mockResolvedValue({ error: null });
    const deleteEqId = vi.fn().mockReturnValue({ eq: deleteEqOrg });
    const deleteAccount = vi.fn().mockReturnValue({ eq: deleteEqId });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        if (table === "channel_accounts") return { delete: deleteAccount };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(
      createTestChannelAccount(ORG_A, USER_1, { provider_destination_id: "dest-1" })
    ).rejects.toThrow("Failed to store channel account secret");

    expect(deleteEqId).toHaveBeenCalledWith("id", accountId);
    expect(deleteEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
  });

  it("allows retry after a secret-insert failure rolls back the account", async () => {
    const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: accountId,
            organization_id: ORG_A,
            channel: "test",
            status: "active",
            provider_destination_id: "dest-1",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "secret insert failed" } })
      .mockResolvedValueOnce({ error: null });
    const deleteEqOrg = vi.fn().mockResolvedValue({ error: null });
    const deleteEqId = vi.fn().mockReturnValue({ eq: deleteEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        if (table === "channel_accounts") {
          return { delete: vi.fn().mockReturnValue({ eq: deleteEqId }) };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(
      createTestChannelAccount(ORG_A, USER_1, { provider_destination_id: "dest-1" })
    ).rejects.toThrow("Failed to store channel account secret");

    const retried = await createTestChannelAccount(ORG_A, USER_1, {
      provider_destination_id: "dest-1",
    });

    expect(insertAccount).toHaveBeenCalledTimes(2);
    expect(insertSecret).toHaveBeenCalledTimes(2);
    expect(retried.webhookSecret).toBe("s".repeat(64));
    expect(retried).not.toHaveProperty("webhook_secret");
  });

  it("never selects secrets when listing accounts", async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  organization_id: ORG_A,
                  channel: "test",
                  status: "active",
                  provider_destination_id: "dest-1",
                  created_by_user_id: USER_1,
                  created_at: "2026-08-27T00:00:00Z",
                  updated_at: "2026-08-27T00:00:00Z",
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const listed = await listChannelAccounts(ORG_A, USER_1);
    expect(listed[0]).not.toHaveProperty("webhookSecret");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("webhook_secret");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("provider_access_token");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("webhook_verify_token");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("app_secret");
  });

  it("never selects secrets when getting one account", async () => {
    const select = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              organization_id: ORG_A,
              channel: "whatsapp",
              status: "active",
              provider_destination_id: "123456789012345",
              created_by_user_id: USER_1,
              created_at: "2026-08-27T00:00:00Z",
              updated_at: "2026-08-27T00:00:00Z",
            },
            error: null,
          }),
        }),
      }),
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const got = await getChannelAccount(
      ORG_A,
      USER_1,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(got).not.toHaveProperty("webhookSecret");
    expect(got).not.toHaveProperty("accessToken");
    expect(got).not.toHaveProperty("appSecret");
    expect(got).not.toHaveProperty("webhookVerifyToken");
    expect(JSON.stringify(got)).not.toContain("provider_access_token");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("webhook_secret");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("provider_access_token");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("webhook_verify_token");
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createTestChannelAccount(ORG_A, USER_1, { provider_destination_id: "dest-1" })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe("createWhatsAppChannelAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("stores WhatsApp credentials off the public row and never returns them", async () => {
    const accessToken = "EAAG." + "x".repeat(200);
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "whatsapp",
            status: "active",
            provider_destination_id: "123456789012345",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createChannelAccount(ORG_A, USER_1, {
      channel: "whatsapp",
      provider_destination_id: "123456789012345",
      access_token: accessToken,
      webhook_verify_token: "verify-me",
      app_secret: "s".repeat(32),
    });

    expect(created).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(created)).not.toContain(accessToken);
    expect(JSON.stringify(created)).not.toContain("verify-me");
    expect(JSON.stringify(insertAccount.mock.calls[0]?.[0])).not.toContain("access");
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: "s".repeat(32),
      provider_access_token: accessToken,
      webhook_verify_token: "verify-me",
    });
  });

  it("does not require WhatsApp fields when creating a test account", async () => {
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "test",
            status: "active",
            provider_destination_id: "dest-1",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createChannelAccount(ORG_A, USER_1, {
      provider_destination_id: "Dest-1",
    });
    expect(created).toHaveProperty("webhookSecret");
    expect(insertAccount.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ channel: "test" })
    );
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: "s".repeat(64),
    });
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
        access_token: "token",
        webhook_verify_token: "verify",
        app_secret: "s".repeat(32),
      })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe("createEmailChannelAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("stores Email credentials off the public row and never returns them", async () => {
    const accessToken = "re_" + "x".repeat(40);
    const signingSecret = `whsec_${"a".repeat(32)}`;
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "email",
            status: "active",
            provider_destination_id: "sales@acme.example",
            created_by_user_id: USER_1,
            created_at: "2026-08-27T00:00:00Z",
            updated_at: "2026-08-27T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createChannelAccount(ORG_A, USER_1, {
      channel: "email",
      provider_destination_id: "Sales@Acme.Example",
      access_token: accessToken,
      webhook_signing_secret: signingSecret,
    });

    expect(created).not.toHaveProperty("webhookSecret");
    expect(created).not.toHaveProperty("webhookSigningSecret");
    expect(JSON.stringify(created)).not.toContain(accessToken);
    expect(JSON.stringify(created)).not.toContain(signingSecret);
    expect(JSON.stringify(insertAccount.mock.calls[0]?.[0])).not.toContain("re_");
    expect(insertAccount.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        channel: "email",
        provider_destination_id: "sales@acme.example",
      })
    );
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: signingSecret,
      provider_access_token: accessToken,
    });
  });

  it("rejects a destination that is not an email address", async () => {
    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "email",
        provider_destination_id: "not-an-email",
        access_token: "re_token",
        webhook_signing_secret: `whsec_${"a".repeat(32)}`,
      })
    ).rejects.toThrow("Invalid channel account data");
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "email",
        provider_destination_id: "sales@acme.example",
        access_token: "re_token",
        webhook_signing_secret: `whsec_${"a".repeat(32)}`,
      })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe("createSmsChannelAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("stores SMS credentials off the public row and never returns them", async () => {
    const accessToken = "KEY" + "x".repeat(40);
    const signingSecret = Buffer.alloc(32, 7).toString("base64");
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "sms",
            status: "active",
            provider_destination_id: "+17735550001",
            created_by_user_id: USER_1,
            created_at: "2026-08-28T00:00:00Z",
            updated_at: "2026-08-28T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createChannelAccount(ORG_A, USER_1, {
      channel: "sms",
      provider_destination_id: "+1 (773) 555-0001",
      access_token: accessToken,
      webhook_signing_secret: signingSecret,
    });

    expect(created).not.toHaveProperty("webhookSecret");
    expect(created).not.toHaveProperty("webhookSigningSecret");
    expect(JSON.stringify(created)).not.toContain(accessToken);
    expect(JSON.stringify(created)).not.toContain(signingSecret);
    expect(JSON.stringify(insertAccount.mock.calls[0]?.[0])).not.toContain("KEY");
    expect(insertAccount.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        channel: "sms",
        provider_destination_id: "+17735550001",
      })
    );
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: signingSecret,
      provider_access_token: accessToken,
    });
    expect(insertSecret.mock.calls[0]?.[0]).not.toHaveProperty(
      "webhook_verify_token"
    );
  });

  it("rejects a destination that is not a canonical E.164 number", async () => {
    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "sms",
        provider_destination_id: "7735550001",
        access_token: "KEY" + "t".repeat(40),
        webhook_signing_secret: Buffer.alloc(32, 7).toString("base64"),
      })
    ).rejects.toThrow("Invalid channel account data");
  });

  it("rejects non-members", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "sms",
        provider_destination_id: "+17735550001",
        access_token: "KEY" + "t".repeat(40),
        webhook_signing_secret: Buffer.alloc(32, 7).toString("base64"),
      })
    ).rejects.toBeInstanceOf(TenantAccessError);
  });
});

describe("createTelegramChannelAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(registerTelegramWebhook).mockResolvedValue({ ok: true });
  });

  it("stores the bot token off the public row, generates a webhook secret, and never returns them", async () => {
    const accessToken = "123456:AA" + "x".repeat(30);
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "telegram",
            status: "active",
            provider_destination_id: "vg_sales_bot",
            created_by_user_id: USER_1,
            created_at: "2026-09-09T00:00:00Z",
            updated_at: "2026-09-09T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const created = await createChannelAccount(ORG_A, USER_1, {
      channel: "telegram",
      provider_destination_id: "@VG_Sales_Bot",
      access_token: accessToken,
    });

    expect(created).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(created)).not.toContain(accessToken);
    expect(JSON.stringify(insertAccount.mock.calls[0]?.[0])).not.toContain(accessToken);
    expect(insertAccount.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        channel: "telegram",
        provider_destination_id: "vg_sales_bot",
      })
    );
    expect(insertSecret).toHaveBeenCalledWith({
      channel_account_id: created.id,
      organization_id: ORG_A,
      webhook_secret: "s".repeat(64),
      provider_access_token: accessToken,
    });
    expect(registerTelegramWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken,
        secretToken: "s".repeat(64),
      })
    );
    expect(String(vi.mocked(registerTelegramWebhook).mock.calls[0]?.[0].webhookUrl)).toContain(
      created.id
    );
  });

  it("rolls back when Telegram webhook registration fails", async () => {
    vi.mocked(registerTelegramWebhook).mockResolvedValue({
      ok: false,
      errorCode: "INVALID_ACCESS_TOKEN",
    });
    const insertAccount = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            organization_id: ORG_A,
            channel: "telegram",
            status: "active",
            provider_destination_id: "vg_sales_bot",
            created_by_user_id: USER_1,
            created_at: "2026-09-09T00:00:00Z",
            updated_at: "2026-09-09T00:00:00Z",
          },
          error: null,
        }),
      }),
    });
    const insertSecret = vi.fn().mockResolvedValue({ error: null });
    const deleteAccount = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { insert: insertAccount };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { insert: insertSecret };
        if (table === "channel_accounts") return { delete: deleteAccount };
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(
      createChannelAccount(ORG_A, USER_1, {
        channel: "telegram",
        provider_destination_id: "vg_sales_bot",
        access_token: "123456:AA" + "x".repeat(30),
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(deleteAccount).toHaveBeenCalled();
  });
});

const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function publicAccountRow(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: ACCOUNT_ID,
    organization_id: ORG_A,
    channel: "test",
    status: "active",
    provider_destination_id: "dest-1",
    created_by_user_id: USER_1,
    created_at: "2026-08-27T00:00:00Z",
    updated_at: "2026-08-27T00:00:00Z",
    ...overrides,
  };
}

function mockAccountLookup(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const select = vi.fn().mockReturnValue({ eq: eqId });
  return { select, eqId, eqOrg, maybeSingle };
}

function mockScopedUpdate(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ maybeSingle });
  const eqOrg = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const update = vi.fn().mockReturnValue({ eq: eqId });
  return { update, eqId, eqOrg, select, maybeSingle };
}

describe("getChannelAccount — tenant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns 404 when the account is missing in-organization", async () => {
    const lookup = mockAccountLookup(null);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(getChannelAccount(ORG_A, USER_1, ACCOUNT_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(lookup.eqId).toHaveBeenCalledWith("id", ACCOUNT_ID);
    expect(lookup.eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
  });
});

describe("updateChannelAccountStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgRole).mockResolvedValue({} as never);
  });

  it("moves active to paused to active without changing channel or destination", async () => {
    const pausedRow = publicAccountRow({ status: "paused" });
    const activeRow = publicAccountRow({ status: "active" });
    const firstLookup = mockAccountLookup(publicAccountRow({ status: "active" }));
    const firstUpdate = mockScopedUpdate({ data: pausedRow, error: null });
    const secondLookup = mockAccountLookup(pausedRow);
    const secondUpdate = mockScopedUpdate({ data: activeRow, error: null });

    vi.mocked(createClient)
      .mockResolvedValueOnce({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channel_accounts") {
            return { select: firstLookup.select, update: firstUpdate.update };
          }
          return {};
        }),
      } as unknown as Awaited<ReturnType<typeof createClient>>)
      .mockResolvedValueOnce({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channel_accounts") {
            return { select: firstLookup.select, update: firstUpdate.update };
          }
          return {};
        }),
      } as unknown as Awaited<ReturnType<typeof createClient>>)
      .mockResolvedValueOnce({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channel_accounts") {
            return { select: secondLookup.select, update: secondUpdate.update };
          }
          return {};
        }),
      } as unknown as Awaited<ReturnType<typeof createClient>>)
      .mockResolvedValueOnce({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === "channel_accounts") {
            return { select: secondLookup.select, update: secondUpdate.update };
          }
          return {};
        }),
      } as unknown as Awaited<ReturnType<typeof createClient>>);

    const paused = await updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
      status: "paused",
    });
    const active = await updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
      status: "active",
    });

    expect(paused.status).toBe("paused");
    expect(active.status).toBe("active");
    expect(paused.channel).toBe("test");
    expect(paused.providerDestinationId).toBe("dest-1");
    expect(firstUpdate.update).toHaveBeenCalledWith({ status: "paused" });
    expect(secondUpdate.update).toHaveBeenCalledWith({ status: "active" });
    expect(firstUpdate.eqId).toHaveBeenCalledWith("id", ACCOUNT_ID);
    expect(firstUpdate.eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(JSON.stringify(firstUpdate.update.mock.calls[0]?.[0])).not.toContain(
      "channel"
    );
    expect(JSON.stringify(firstUpdate.update.mock.calls[0]?.[0])).not.toContain(
      "provider_destination_id"
    );
  });

  it("moves active to disabled to active", async () => {
    const disabledRow = publicAccountRow({ status: "disabled" });
    const lookup = mockAccountLookup(publicAccountRow({ status: "active" }));
    const update = mockScopedUpdate({ data: disabledRow, error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return { select: lookup.select, update: update.update };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const disabled = await updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
      status: "disabled",
    });
    expect(disabled.status).toBe("disabled");
    expect(update.update).toHaveBeenCalledWith({ status: "disabled" });
  });

  it("moves paused to disabled", async () => {
    const lookup = mockAccountLookup(publicAccountRow({ status: "paused" }));
    const update = mockScopedUpdate({
      data: publicAccountRow({ status: "disabled" }),
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return { select: lookup.select, update: update.update };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const disabled = await updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
      status: "disabled",
    });
    expect(disabled.status).toBe("disabled");
  });

  it("is idempotent for the same status and does not write", async () => {
    const lookup = mockAccountLookup(publicAccountRow({ status: "paused" }));
    const update = mockScopedUpdate({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return { select: lookup.select, update: update.update };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const result = await updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
      status: "paused",
    });
    expect(result.status).toBe("paused");
    expect(update.update).not.toHaveBeenCalled();
  });

  it("rejects extra keys and invalid status with zero writes", async () => {
    const lookup = mockAccountLookup(publicAccountRow());
    const update = mockScopedUpdate({ data: null, error: null });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return { select: lookup.select, update: update.update };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, {
        status: "paused",
        channel: "sms",
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, { status: "archived" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(lookup.select).not.toHaveBeenCalled();
    expect(update.update).not.toHaveBeenCalled();
  });

  it("rejects agents", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new TenantAccessError());
    await expect(
      updateChannelAccountStatus(ORG_A, USER_1, ACCOUNT_ID, { status: "paused" })
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("rotateChannelAccountSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgRole).mockResolvedValue({} as never);
    vi.mocked(generateChannelWebhookSecret).mockReturnValue("n".repeat(64));
    vi.mocked(registerTelegramWebhook).mockResolvedValue({ ok: true });
  });

  it("replaces the Test webhook secret in the existing row and returns it once", async () => {
    const lookup = mockAccountLookup(publicAccountRow({ channel: "test" }));
    const secretUpdate = mockScopedUpdate({
      data: { channel_account_id: ACCOUNT_ID },
      error: null,
    });
    const insert = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const rotated = await rotateChannelAccountSecrets(
      ORG_A,
      USER_1,
      ACCOUNT_ID,
      {}
    );

    expect(rotated).toMatchObject({
      id: ACCOUNT_ID,
      channel: "test",
      status: "active",
      webhookSecret: "n".repeat(64),
    });
    expect(generateChannelWebhookSecret).toHaveBeenCalledTimes(1);
    expect(secretUpdate.update).toHaveBeenCalledWith({
      webhook_secret: "n".repeat(64),
    });
    expect(secretUpdate.eqId).toHaveBeenCalledWith(
      "channel_account_id",
      ACCOUNT_ID
    );
    expect(secretUpdate.eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(insert).not.toHaveBeenCalled();

    const laterLookup = mockAccountLookup(publicAccountRow({ channel: "test" }));
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: laterLookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    const later = await getChannelAccount(ORG_A, USER_1, ACCOUNT_ID);
    expect(later).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(later)).not.toContain("n".repeat(64));
  });

  it("replaces WhatsApp credentials and never returns them", async () => {
    const accessToken = "EAAG." + "y".repeat(80);
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "whatsapp",
        provider_destination_id: "123456789012345",
      })
    );
    const secretUpdate = mockScopedUpdate({
      data: { channel_account_id: ACCOUNT_ID },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert: vi.fn() };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const rotated = await rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
      access_token: accessToken,
      webhook_verify_token: "rotated-verify",
      app_secret: "a".repeat(32),
    });

    expect(rotated).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(rotated)).not.toContain(accessToken);
    expect(JSON.stringify(rotated)).not.toContain("rotated-verify");
    expect(secretUpdate.update).toHaveBeenCalledWith({
      webhook_secret: "a".repeat(32),
      provider_access_token: accessToken,
      webhook_verify_token: "rotated-verify",
    });
    expect(rotated.channel).toBe("whatsapp");
    expect(rotated.providerDestinationId).toBe("123456789012345");
    expect(rotated.status).toBe("active");
  });

  it("replaces Telegram credentials, regenerates the webhook secret, and never returns them", async () => {
    const accessToken = "123456:AA" + "y".repeat(30);
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "telegram",
        provider_destination_id: "vg_sales_bot",
      })
    );
    const secretUpdate = mockScopedUpdate({
      data: { channel_account_id: ACCOUNT_ID },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert: vi.fn() };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const rotated = await rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
      access_token: accessToken,
    });

    expect(rotated).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(rotated)).not.toContain(accessToken);
    expect(JSON.stringify(rotated)).not.toContain("n".repeat(64));
    expect(secretUpdate.update).toHaveBeenCalledWith({
      webhook_secret: "n".repeat(64),
      provider_access_token: accessToken,
    });
    expect(registerTelegramWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken,
        secretToken: "n".repeat(64),
      })
    );
  });

  it("replaces Email credentials and keeps whsec_ validation", async () => {
    const accessToken = "re_" + "z".repeat(40);
    const signingSecret = `whsec_${"b".repeat(32)}`;
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "email",
        provider_destination_id: "sales@acme.example",
      })
    );
    const secretUpdate = mockScopedUpdate({
      data: { channel_account_id: ACCOUNT_ID },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert: vi.fn() };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const rotated = await rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
      access_token: accessToken,
      webhook_signing_secret: signingSecret,
    });

    expect(rotated).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(rotated)).not.toContain(accessToken);
    expect(JSON.stringify(rotated)).not.toContain(signingSecret);
    expect(JSON.stringify(rotated)).not.toContain("whsec_");
    expect(secretUpdate.update).toHaveBeenCalledWith({
      webhook_secret: signingSecret,
      provider_access_token: accessToken,
    });
  });

  it("replaces SMS credentials without imposing Email's whsec_ prefix", async () => {
    const accessToken = "KEY" + "z".repeat(40);
    const signingSecret = Buffer.alloc(32, 9).toString("base64");
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "sms",
        provider_destination_id: "+17735550001",
      })
    );
    const secretUpdate = mockScopedUpdate({
      data: { channel_account_id: ACCOUNT_ID },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert: vi.fn() };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const rotated = await rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
      access_token: accessToken,
      webhook_signing_secret: signingSecret,
    });

    expect(rotated.channel).toBe("sms");
    expect(JSON.stringify(rotated)).not.toContain(accessToken);
    expect(JSON.stringify(rotated)).not.toContain(signingSecret);
    expect(secretUpdate.update).toHaveBeenCalledWith({
      webhook_secret: signingSecret,
      provider_access_token: accessToken,
    });
    expect(secretUpdate.update.mock.calls[0]?.[0]).not.toHaveProperty(
      "webhook_verify_token"
    );
  });

  it("rejects Email rotation without whsec_ and does not write", async () => {
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "email",
        provider_destination_id: "sales@acme.example",
      })
    );
    const admin = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockImplementation(admin);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: "p".repeat(44),
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(admin).not.toHaveBeenCalled();
  });

  it("rejects wrong-channel bodies, identity fields, and empty credentials with zero writes", async () => {
    const lookup = mockAccountLookup(
      publicAccountRow({
        channel: "sms",
        provider_destination_id: "+17735550001",
      })
    );
    const admin = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockImplementation(admin);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
        channel: "email",
        access_token: "re_" + "x".repeat(40),
        webhook_signing_secret: `whsec_${"a".repeat(32)}`,
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
        provider_destination_id: "+17735559999",
        access_token: "KEY" + "t".repeat(40),
        webhook_signing_secret: Buffer.alloc(32, 7).toString("base64"),
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
        access_token: "EAAG." + "x".repeat(80),
        webhook_verify_token: "verify",
        app_secret: "s".repeat(32),
      })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {
        access_token: "",
        webhook_signing_secret: "",
      })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(admin).not.toHaveBeenCalled();
  });

  it("fails closed when the secret row is missing and does not insert", async () => {
    const lookup = mockAccountLookup(publicAccountRow({ channel: "test" }));
    const secretUpdate = mockScopedUpdate({ data: null, error: null });
    const insert = vi.fn();
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") return { select: lookup.select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return { update: secretUpdate.update, insert };
        }
        return {};
      }),
    } as unknown as ReturnType<typeof createAdminClient>);

    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {})
    ).rejects.toThrow("Failed to rotate channel account secret");

    expect(insert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("Failed to rotate channel account secret", {
      organizationId: ORG_A,
      code: "CHANNEL_ACCOUNT_SECRET_MISSING",
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("n".repeat(64));
    errorSpy.mockRestore();
  });

  it("rejects agents before any write", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new TenantAccessError());
    await expect(
      rotateChannelAccountSecrets(ORG_A, USER_1, ACCOUNT_ID, {})
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

