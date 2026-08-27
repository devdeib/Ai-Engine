/**
 * Channel identity listing. Membership-gated. No secrets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { listChannelIdentities } from "@/modules/channels/identities";
import type { ChannelIdentity } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";

const identityRow: ChannelIdentity = {
  id: IDENTITY_ID,
  organization_id: ORG_A,
  channel_account_id: ACCOUNT_ID,
  external_address: "+9745550001",
  lead_id: LEAD_ID,
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
};

describe("listChannelIdentities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("rejects non-members before querying", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listChannelIdentities(ORG_A, USER_1)).rejects.toBeInstanceOf(
      TenantAccessError
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("scopes the query to the organization and omits secrets from the public DTO", async () => {
    const range = vi.fn().mockResolvedValue({ data: [identityRow], error: null });
    const orderId = vi.fn().mockReturnValue({ range });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eq = vi.fn().mockReturnValue({ order: orderCreated });
    const select = vi.fn().mockReturnValue({ eq });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") return { select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const listed = await listChannelIdentities(ORG_A, USER_1, { page: 2, limit: 10 });

    expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(range).toHaveBeenCalledWith(10, 19);
    expect(listed).toEqual([
      {
        id: IDENTITY_ID,
        organizationId: ORG_A,
        channelAccountId: ACCOUNT_ID,
        externalAddress: "+9745550001",
        leadId: LEAD_ID,
        createdAt: "2026-08-27T00:00:00Z",
      },
    ]);
    expect(listed[0]).not.toHaveProperty("webhookSecret");
    expect(listed[0]).not.toHaveProperty("webhook_secret");
    expect(JSON.stringify(listed)).not.toContain("secret");
  });
});
