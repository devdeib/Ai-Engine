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
  listChannelIdentityMatchCandidates,
} from "@/modules/channels/identities";
import {
  CHANNEL_STUB_LEAD_FIRST_NAME,
  CHANNEL_STUB_LEAD_LAST_NAME,
} from "@/modules/channels/constants";
import {
  CHANNEL_ACCOUNT_MATCH_SELECT,
  CHANNEL_IDENTITY_MATCH_CANDIDATE_SELECT,
} from "@/modules/channels/match";
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

  it("filters by lead_id within the organization", async () => {
    const range = vi.fn().mockResolvedValue({ data: [identityRow], error: null });
    const orderId = vi.fn().mockReturnValue({ range });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eqLead = vi.fn().mockReturnValue({ order: orderCreated });
    const eqOrg = vi.fn().mockReturnValue({ eq: eqLead, order: orderCreated });
    const select = vi.fn().mockReturnValue({ eq: eqOrg });
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") return { select };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await listChannelIdentities(ORG_A, USER_1, { page: 1, limit: 20 }, {
      leadId: LEAD_ID,
    });

    expect(eqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(eqLead).toHaveBeenCalledWith("lead_id", LEAD_ID);
  });

  it("treats unmatched=true as stub-lead attached, not lead_id IS NULL", async () => {
    const stubLead = {
      id: LEAD_ID,
      first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: CHANNEL_STUB_LEAD_LAST_NAME,
      email: null,
      phone: null,
    };
    const realLead = {
      id: "22222222-2222-4222-8222-222222222222",
      first_name: "Ahmed",
      last_name: "Ali",
      email: "ahmed@example.com",
      phone: null,
    };
    const stubIdentity = identityRow;
    const matchedIdentity = {
      ...identityRow,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lead_id: realLead.id,
    };
    const orderId = vi.fn().mockResolvedValue({
      data: [stubIdentity, matchedIdentity],
      error: null,
    });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eqOrg = vi.fn().mockReturnValue({ order: orderCreated });
    const identitySelect = vi.fn().mockReturnValue({ eq: eqOrg });
    const inIds = vi.fn().mockResolvedValue({
      data: [stubLead, realLead],
      error: null,
    });
    const leadEqOrg = vi.fn().mockReturnValue({ in: inIds });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const insert = vi.fn();
    const rpc = vi.fn();

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: identitySelect, insert };
        }
        if (table === "leads") {
          return { select: leadSelect };
        }
        return {};
      }),
      rpc,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const unmatched = await listChannelIdentities(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { unmatched: true }
    );
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.id).toBe(IDENTITY_ID);
    expect(inIds).toHaveBeenCalledWith("id", expect.arrayContaining([LEAD_ID, realLead.id]));
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats unmatched=false as identities attached to real CRM leads", async () => {
    const stubLead = {
      id: LEAD_ID,
      first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: CHANNEL_STUB_LEAD_LAST_NAME,
      email: null,
      phone: null,
    };
    const realLead = {
      id: "22222222-2222-4222-8222-222222222222",
      first_name: "Ahmed",
      last_name: "Ali",
      email: "ahmed@example.com",
      phone: null,
    };
    const matchedIdentity = {
      ...identityRow,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lead_id: realLead.id,
    };
    const range = vi.fn();
    const orderId = vi.fn().mockResolvedValue({
      data: [identityRow, matchedIdentity],
      error: null,
    });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eqOrg = vi.fn().mockReturnValue({ order: orderCreated });
    const identitySelect = vi.fn().mockReturnValue({ eq: eqOrg });
    const inIds = vi.fn().mockResolvedValue({
      data: [stubLead, realLead],
      error: null,
    });
    const leadEqOrg = vi.fn().mockReturnValue({ in: inIds });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: identitySelect };
        }
        if (table === "leads") {
          return { select: leadSelect };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const matched = await listChannelIdentities(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { unmatched: false }
    );
    expect(range).not.toHaveBeenCalled();
    expect(matched).toHaveLength(1);
    expect(matched[0]?.id).toBe(matchedIdentity.id);
    expect(leadEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
  });

  it("does not treat lead_id IS NULL as unmatched", async () => {
    const nullLeadIdentity = { ...identityRow, lead_id: null };
    const orderId = vi.fn().mockResolvedValue({
      data: [nullLeadIdentity],
      error: null,
    });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eqOrg = vi.fn().mockReturnValue({ order: orderCreated });
    const identitySelect = vi.fn().mockReturnValue({ eq: eqOrg });
    const leadSelect = vi.fn();

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: identitySelect };
        }
        if (table === "leads") {
          return { select: leadSelect };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const unmatched = await listChannelIdentities(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { unmatched: true }
    );
    expect(unmatched).toEqual([]);
    expect(leadSelect).not.toHaveBeenCalled();
  });

  it("paginates unmatched identities after stub filtering", async () => {
    const stubLeadA = {
      id: LEAD_ID,
      first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: CHANNEL_STUB_LEAD_LAST_NAME,
      email: null,
      phone: null,
    };
    const stubLeadB = {
      id: "22222222-2222-4222-8222-222222222222",
      first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: CHANNEL_STUB_LEAD_LAST_NAME,
      email: null,
      phone: null,
    };
    const identityB = {
      ...identityRow,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lead_id: stubLeadB.id,
    };
    const orderId = vi.fn().mockResolvedValue({
      data: [identityRow, identityB],
      error: null,
    });
    const orderCreated = vi.fn().mockReturnValue({ order: orderId });
    const eqOrg = vi.fn().mockReturnValue({ order: orderCreated });
    const identitySelect = vi.fn().mockReturnValue({ eq: eqOrg });
    const inIds = vi.fn().mockResolvedValue({
      data: [stubLeadA, stubLeadB],
      error: null,
    });
    const leadEqOrg = vi.fn().mockReturnValue({ in: inIds });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "channel_identities") {
          return { select: identitySelect };
        }
        if (table === "leads") {
          return { select: leadSelect };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const pageTwo = await listChannelIdentities(
      ORG_A,
      USER_1,
      { page: 2, limit: 1 },
      { unmatched: true }
    );
    expect(pageTwo).toHaveLength(1);
    expect(pageTwo[0]?.id).toBe(identityB.id);
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

const REAL_LEAD_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_LEAD_ID = "33333333-3333-4333-8333-333333333333";

function makeLeadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REAL_LEAD_ID,
    first_name: "Ahmed",
    last_name: "Ali",
    email: "ahmed@example.com",
    phone: "97455551234",
    company_name: "Acme",
    status: "new",
    notes: "secret notes",
    score: 90,
    owner_id: USER_1,
    ...overrides,
  };
}

function mockMatchCandidateQueries({
  identity = identityRow,
  account = { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
  leads = [makeLeadRow()],
}: {
  identity?: ChannelIdentity | null;
  account?: { id: string; organization_id: string; channel: string } | null;
  leads?: Array<Record<string, unknown>>;
} = {}) {
  const identityMaybeSingle = vi.fn().mockResolvedValue({
    data: identity,
    error: null,
  });
  const identityEqOrg = vi.fn().mockReturnValue({
    maybeSingle: identityMaybeSingle,
  });
  const identityEqId = vi.fn().mockReturnValue({ eq: identityEqOrg });
  const identitySelect = vi.fn().mockReturnValue({ eq: identityEqId });

  const accountMaybeSingle = vi.fn().mockResolvedValue({
    data: account,
    error: null,
  });
  const accountEqOrg = vi.fn().mockReturnValue({
    maybeSingle: accountMaybeSingle,
  });
  const accountEqId = vi.fn().mockReturnValue({ eq: accountEqOrg });
  const accountSelect = vi.fn().mockReturnValue({ eq: accountEqId });

  const leadsEqOrg = vi.fn().mockResolvedValue({ data: leads, error: null });
  const leadsSelect = vi.fn().mockReturnValue({ eq: leadsEqOrg });
  const insert = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const rpc = vi.fn();

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "channel_identities") {
      return { select: identitySelect, insert, update, delete: del };
    }
    if (table === "channel_accounts") {
      return { select: accountSelect, insert, update, delete: del };
    }
    if (table === "leads") {
      return { select: leadsSelect, insert, update, delete: del };
    }
    return { select: vi.fn(), insert, update, delete: del };
  });

  vi.mocked(createClient).mockResolvedValue({
    from,
    rpc,
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return {
    from,
    identitySelect,
    identityEqId,
    identityEqOrg,
    accountSelect,
    accountEqId,
    accountEqOrg,
    leadsSelect,
    leadsEqOrg,
    insert,
    update,
    del,
    rpc,
  };
}

describe("listChannelIdentityMatchCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("rejects non-members before querying", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      listChannelIdentityMatchCandidates(ORG_A, USER_1, IDENTITY_ID)
    ).rejects.toBeInstanceOf(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns 404-equivalent not found for a missing in-organization identity", async () => {
    const mocks = mockMatchCandidateQueries({ identity: null });
    await expect(
      listChannelIdentityMatchCandidates(ORG_A, USER_1, IDENTITY_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mocks.identityEqId).toHaveBeenCalledWith("id", IDENTITY_ID);
    expect(mocks.identityEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.accountSelect).not.toHaveBeenCalled();
    expect(mocks.leadsSelect).not.toHaveBeenCalled();
  });

  it("scopes identity, channel account, and leads to the organization", async () => {
    const mocks = mockMatchCandidateQueries({
      identity: { ...identityRow, external_address: "John.Doe@Example.com" },
      account: { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
      leads: [
        makeLeadRow({ email: "john.doe@example.com" }),
        makeLeadRow({
          id: OTHER_LEAD_ID,
          email: "other@example.com",
          first_name: "Other",
        }),
      ],
    });

    const candidates = await listChannelIdentityMatchCandidates(
      ORG_A,
      USER_1,
      IDENTITY_ID
    );

    expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(mocks.identityEqId).toHaveBeenCalledWith("id", IDENTITY_ID);
    expect(mocks.identityEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.accountEqId).toHaveBeenCalledWith("id", ACCOUNT_ID);
    expect(mocks.accountEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.accountSelect).toHaveBeenCalledWith(CHANNEL_ACCOUNT_MATCH_SELECT);
    expect(mocks.leadsSelect).toHaveBeenCalledWith(
      CHANNEL_IDENTITY_MATCH_CANDIDATE_SELECT
    );
    expect(mocks.leadsEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(mocks.from).not.toHaveBeenCalledWith("channel_account_secrets");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe(REAL_LEAD_ID);
    expect(candidates[0]).toEqual({
      id: REAL_LEAD_ID,
      firstName: "Ahmed",
      lastName: "Ali",
      email: "john.doe@example.com",
      phone: "97455551234",
      companyName: "Acme",
      status: "new",
    });
    expect(candidates[0]).not.toHaveProperty("notes");
    expect(candidates[0]).not.toHaveProperty("score");
    expect(candidates[0]).not.toHaveProperty("owner_id");
  });

  it("matches WhatsApp, SMS, and Test phones by digits", async () => {
    const phoneLead = makeLeadRow({
      email: null,
      phone: "+974 5555 1234",
    });

    for (const channel of ["whatsapp", "sms", "test"] as const) {
      mockMatchCandidateQueries({
        identity: { ...identityRow, external_address: "97455551234" },
        account: { id: ACCOUNT_ID, organization_id: ORG_A, channel },
        leads: [phoneLead],
      });
      const candidates = await listChannelIdentityMatchCandidates(
        ORG_A,
        USER_1,
        IDENTITY_ID
      );
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.id).toBe(REAL_LEAD_ID);
    }
  });

  it("excludes stub leads and the current stub attachment from candidates", async () => {
    const stubLead = makeLeadRow({
      id: LEAD_ID,
      first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
      last_name: CHANNEL_STUB_LEAD_LAST_NAME,
      email: null,
      phone: null,
    });
    const matching = makeLeadRow({
      email: "john.doe@example.com",
    });
    mockMatchCandidateQueries({
      identity: { ...identityRow, external_address: "John.Doe@Example.com" },
      account: { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
      leads: [stubLead, matching],
    });

    const candidates = await listChannelIdentityMatchCandidates(
      ORG_A,
      USER_1,
      IDENTITY_ID
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual([REAL_LEAD_ID]);
  });

  it("keeps a currently attached real CRM lead when it matches", async () => {
    mockMatchCandidateQueries({
      identity: {
        ...identityRow,
        lead_id: REAL_LEAD_ID,
        external_address: "john.doe@example.com",
      },
      account: { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
      leads: [makeLeadRow({ email: "JOHN.DOE@EXAMPLE.COM" })],
    });

    const candidates = await listChannelIdentityMatchCandidates(
      ORG_A,
      USER_1,
      IDENTITY_ID
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toBe(REAL_LEAD_ID);
  });

  it("returns an empty page when no real CRM leads match", async () => {
    mockMatchCandidateQueries({
      identity: { ...identityRow, external_address: "nobody@example.com" },
      account: { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
      leads: [
        makeLeadRow({
          id: LEAD_ID,
          first_name: CHANNEL_STUB_LEAD_FIRST_NAME,
          last_name: CHANNEL_STUB_LEAD_LAST_NAME,
          email: null,
          phone: null,
        }),
        makeLeadRow({ email: "other@example.com" }),
      ],
    });

    const candidates = await listChannelIdentityMatchCandidates(
      ORG_A,
      USER_1,
      IDENTITY_ID
    );
    expect(candidates).toEqual([]);
  });

  it("paginates matching candidates after sorting", async () => {
    mockMatchCandidateQueries({
      identity: { ...identityRow, external_address: "shared@example.com" },
      account: { id: ACCOUNT_ID, organization_id: ORG_A, channel: "email" },
      leads: [
        makeLeadRow({
          id: REAL_LEAD_ID,
          first_name: "Zed",
          last_name: "Zed",
          email: "shared@example.com",
        }),
        makeLeadRow({
          id: OTHER_LEAD_ID,
          first_name: "Ann",
          last_name: "Ann",
          email: "shared@example.com",
        }),
      ],
    });

    const pageTwo = await listChannelIdentityMatchCandidates(
      ORG_A,
      USER_1,
      IDENTITY_ID,
      { page: 2, limit: 1 }
    );
    expect(pageTwo).toHaveLength(1);
    expect(pageTwo[0]?.id).toBe(REAL_LEAD_ID);
  });
});
