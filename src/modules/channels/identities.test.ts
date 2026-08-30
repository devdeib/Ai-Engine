/**
 * Channel identity listing. Membership-gated. No secrets.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  listChannelIdentities,
  getChannelIdentity,
  attachChannelIdentityLead,
} from "@/modules/channels/identities";
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

describe("getChannelIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("rejects non-members before querying", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      getChannelIdentity(ORG_A, USER_1, IDENTITY_ID)
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("scopes lookup by id and organization and returns the public shape", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: identityRow, error: null });
    const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "channel_identities") return { select };
      return {};
    });
    vi.mocked(createClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const got = await getChannelIdentity(ORG_A, USER_1, IDENTITY_ID);

    expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(from).toHaveBeenCalledWith("channel_identities");
    expect(from).not.toHaveBeenCalledWith("channel_account_secrets");
    expect(eqId).toHaveBeenCalledWith("id", IDENTITY_ID);
    expect(eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(String(select.mock.calls[0]?.[0])).not.toContain("webhook");
    expect(String(select.mock.calls[0]?.[0])).not.toContain("secret");
    expect(got).toEqual({
      id: IDENTITY_ID,
      organizationId: ORG_A,
      channelAccountId: ACCOUNT_ID,
      externalAddress: "+9745550001",
      leadId: LEAD_ID,
      createdAt: "2026-08-27T00:00:00Z",
    });
    expect(got).not.toHaveProperty("updatedAt");
    expect(got).not.toHaveProperty("webhookSecret");
  });

  it("returns not found for a missing in-organization identity", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqOrg = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: vi.fn().mockReturnValue({ eq: eqId }) };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      getChannelIdentity(ORG_A, USER_1, IDENTITY_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("attachChannelIdentityLead", () => {
  const TARGET_LEAD = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  function mockClients(options: {
    identity: ChannelIdentity | null;
    lead: { id: string } | null;
    rpc?: { data: unknown; error: unknown };
    insertIdentity?: ReturnType<typeof vi.fn>;
    deleteLead?: ReturnType<typeof vi.fn>;
  }) {
    const identityMaybe = vi.fn().mockResolvedValue({
      data: options.identity,
      error: null,
    });
    const identityEqOrg = vi.fn().mockReturnValue({ maybeSingle: identityMaybe });
    const identityEqId = vi.fn().mockReturnValue({ eq: identityEqOrg });
    const identitySelect = vi.fn().mockReturnValue({ eq: identityEqId });

    const leadMaybe = vi.fn().mockResolvedValue({
      data: options.lead,
      error: null,
    });
    const leadEqOrg = vi.fn().mockReturnValue({ maybeSingle: leadMaybe });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const rpc = vi.fn().mockResolvedValue(
      options.rpc ?? { data: null, error: null }
    );
    const insertIdentity = options.insertIdentity ?? vi.fn();
    const deleteLead = options.deleteLead ?? vi.fn();

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: identitySelect, insert: insertIdentity };
        }
        if (table === "leads") {
          return { select: leadSelect, delete: deleteLead };
        }
        return {};
      }),
      rpc,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    return {
      identityEqId,
      identityEqOrg,
      identitySelect,
      leadEqId,
      leadEqOrg,
      rpc,
      insertIdentity,
      deleteLead,
    };
  }

  it("rejects non-members before querying", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      attachChannelIdentityLead(ORG_A, USER_1, IDENTITY_ID, TARGET_LEAD)
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("calls the attach RPC with organization, identity, and lead ids", async () => {
    const attached = { ...identityRow, lead_id: TARGET_LEAD };
    const mocks = mockClients({
      identity: identityRow,
      lead: { id: TARGET_LEAD },
      rpc: { data: [attached], error: null },
    });

    const result = await attachChannelIdentityLead(
      ORG_A,
      USER_1,
      IDENTITY_ID,
      TARGET_LEAD
    );

    expect(mocks.identityEqId).toHaveBeenCalledWith("id", IDENTITY_ID);
    expect(mocks.identityEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.leadEqId).toHaveBeenCalledWith("id", TARGET_LEAD);
    expect(mocks.leadEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.rpc).toHaveBeenCalledWith("attach_channel_identity_lead", {
      p_organization_id: ORG_A,
      p_channel_identity_id: IDENTITY_ID,
      p_lead_id: TARGET_LEAD,
    });
    expect(result.leadId).toBe(TARGET_LEAD);
    expect(result).not.toHaveProperty("updatedAt");
    expect(mocks.insertIdentity).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
  });

  it("is idempotent for the same lead and does not call the RPC", async () => {
    const mocks = mockClients({
      identity: identityRow,
      lead: { id: LEAD_ID },
    });

    const result = await attachChannelIdentityLead(
      ORG_A,
      USER_1,
      IDENTITY_ID,
      LEAD_ID
    );

    expect(result.leadId).toBe(LEAD_ID);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.insertIdentity).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
  });

  it("returns not found when the identity is missing in-organization", async () => {
    const mocks = mockClients({ identity: null, lead: { id: TARGET_LEAD } });
    await expect(
      attachChannelIdentityLead(ORG_A, USER_1, IDENTITY_ID, TARGET_LEAD)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns not found when the lead is missing in-organization", async () => {
    const mocks = mockClients({ identity: identityRow, lead: null });
    await expect(
      attachChannelIdentityLead(ORG_A, USER_1, IDENTITY_ID, TARGET_LEAD)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails generically when the RPC errors and does not insert or delete", async () => {
    const mocks = mockClients({
      identity: identityRow,
      lead: { id: TARGET_LEAD },
      rpc: { data: null, error: { code: "40001" } },
    });

    await expect(
      attachChannelIdentityLead(ORG_A, USER_1, IDENTITY_ID, TARGET_LEAD)
    ).rejects.toThrow("Failed to attach channel identity lead");
    expect(mocks.insertIdentity).not.toHaveBeenCalled();
    expect(mocks.deleteLead).not.toHaveBeenCalled();
  });

  it("fails generically when the RPC returns no row", async () => {
    mockClients({
      identity: identityRow,
      lead: { id: TARGET_LEAD },
      rpc: { data: [], error: null },
    });

    await expect(
      attachChannelIdentityLead(ORG_A, USER_1, IDENTITY_ID, TARGET_LEAD)
    ).rejects.toThrow("Failed to attach channel identity lead");
  });
});
