import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));
vi.mock("@/modules/channels/hmac", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/channels/hmac")>();
  return {
    ...actual,
    generateChannelWebhookSecret: vi.fn(() => "s".repeat(64)),
  };
});

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { createTestChannelAccount, listChannelAccounts, getChannelAccount, createChannelAccount } from "@/modules/channels/accounts";

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

