import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  loadChannelAccountSecrets,
  loadEmailDeliveryCredentials,
  loadWhatsAppDeliveryCredentials,
} from "@/modules/channels/secrets";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_TOKEN = "EAAG." + "z".repeat(120);

describe("channel secret loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects only secret columns scoped to account and organization", async () => {
    const eqOrg = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          webhook_secret: "c".repeat(32),
          provider_access_token: ACCESS_TOKEN,
          webhook_verify_token: "verify",
        },
        error: null,
      }),
    });
    const eqAccount = vi.fn().mockReturnValue({ eq: eqOrg });
    const select = vi.fn().mockReturnValue({ eq: eqAccount });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") return { select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const loaded = await loadChannelAccountSecrets(ORG_A, ACCOUNT_ID);
    expect(select).toHaveBeenCalledWith(
      "webhook_secret, provider_access_token, webhook_verify_token"
    );
    expect(eqAccount).toHaveBeenCalledWith("channel_account_id", ACCOUNT_ID);
    expect(eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(loaded?.providerAccessToken).toBe(ACCESS_TOKEN);
  });

  it("does not return credentials for a cross-tenant organization id", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_account_secrets") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      loadChannelAccountSecrets(ORG_B, ACCOUNT_ID)
    ).resolves.toBeNull();
  });

  it("loads WhatsApp delivery credentials from the account destination and secret row", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: ACCOUNT_ID,
                      organization_id: ORG_A,
                      channel: "whatsapp",
                      status: "active",
                      provider_destination_id: "123456789012345",
                    },
                    error: null,
                  }),
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
                      webhook_secret: "c".repeat(32),
                      provider_access_token: ACCESS_TOKEN,
                      webhook_verify_token: "verify",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      loadWhatsAppDeliveryCredentials(ORG_A, ACCOUNT_ID)
    ).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      phoneNumberId: "123456789012345",
    });
  });

  it("loads Email delivery credentials from the mailbox destination and secret row", async () => {
    const emailToken = "re_" + "z".repeat(40);
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: ACCOUNT_ID,
                      organization_id: ORG_A,
                      channel: "email",
                      status: "active",
                      provider_destination_id: "sales@acme.example",
                    },
                    error: null,
                  }),
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
                      webhook_secret: `whsec_${"a".repeat(32)}`,
                      provider_access_token: emailToken,
                      webhook_verify_token: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      loadEmailDeliveryCredentials(ORG_A, ACCOUNT_ID)
    ).resolves.toEqual({
      accessToken: emailToken,
      mailbox: "sales@acme.example",
    });
  });

  it("does not load Email credentials for a WhatsApp account", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_accounts") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: ACCOUNT_ID,
                      organization_id: ORG_A,
                      channel: "whatsapp",
                      status: "active",
                      provider_destination_id: "123456789012345",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      loadEmailDeliveryCredentials(ORG_A, ACCOUNT_ID)
    ).resolves.toBeNull();
  });
});
