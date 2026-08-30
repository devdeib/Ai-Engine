/**
 * Lead domain query tests.
 *
 * Tests cover:
 *   - Application-layer tenant isolation (requireOrgMembership gate)
 *   - Correct data retrieval paths for listLeads and getLead
 *   - Not-found and cross-tenant handling for getLead
 *   - Database error propagation
 *
 * NO LIVE DATABASE IS REQUIRED.
 * The Supabase client is mocked throughout; these tests exercise the
 * application-layer behaviour only.
 *
 * RLS COVERAGE NOTE
 * -----------------
 * True RLS cross-tenant isolation (e.g. "a postgres query from user-A cannot
 * read org-B leads even with a crafted SQL statement") requires a live
 * Supabase / PostgreSQL instance and cannot be tested here.
 * The application-layer defense tested here is:
 *   1. requireOrgMembership() rejects non-members before any lead query runs.
 *   2. Every lead query filters by organization_id so that a lead belonging
 *      to another org is never returned even if the caller somehow bypassed
 *      step 1.
 * The DB-layer defense (RLS via auth_user_role_in_org) must be verified
 * against a staging database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError, NotFoundError } from "@/lib/errors";

// Mock the Supabase server client — no real DB needed.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { listLeads, getLead } from "@/modules/leads/queries";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "user1111-0000-0000-0000-000000000001";
const LEAD_1 = "lead1111-0000-0000-0000-000000000001";

function makeMemberRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "member-id",
    organization_id: ORG_A,
    user_id: USER_1,
    role: "owner",
    invited_by: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    ...overrides,
  };
}

function makeLeadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: "+974 55 123 456",
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builder: listLeads
//
// Supabase chain for requireOrgMembership:
//   from("organization_members").select("*").eq(orgId).eq(userId).single()
//
// Supabase chain for the leads list:
//   from("leads").select("*").eq(orgId).order(...)
// ---------------------------------------------------------------------------

function mockForListLeads({
  memberRow,
  leadsRows = [],
  leadsError = null,
}: {
  memberRow: Record<string, unknown> | null;
  leadsRows?: Record<string, unknown>[];
  leadsError?: { message: string } | null;
}) {
  // organization_members chain
  const memberSingle = vi.fn().mockResolvedValue({
    data: memberRow,
    error: memberRow ? null : { message: "Not found" },
  });
  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  // leads list chain — .select("*").eq(orgId).order(...).range(from, to)
  const leadsRange = vi.fn().mockResolvedValue({
    data: leadsRows,
    error: leadsError,
  });
  const leadsOrder = vi.fn().mockReturnValue({ range: leadsRange });
  const leadsEqOrg = vi.fn().mockReturnValue({ order: leadsOrder });
  const leadsSelect = vi.fn().mockReturnValue({ eq: leadsEqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { select: leadsSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

// ---------------------------------------------------------------------------
// Mock builder: getLead
//
// Supabase chain for requireOrgMembership:
//   from("organization_members").select("*").eq(orgId).eq(userId).single()
//
// Supabase chain for the single lead:
//   from("leads").select("*").eq(leadId).eq(orgId).single()
// ---------------------------------------------------------------------------

function mockForGetLead({
  memberRow,
  leadRow = null,
  leadError = null,
}: {
  memberRow: Record<string, unknown> | null;
  leadRow?: Record<string, unknown> | null;
  leadError?: { message: string } | null;
}) {
  // organization_members chain
  const memberSingle = vi.fn().mockResolvedValue({
    data: memberRow,
    error: memberRow ? null : { message: "Not found" },
  });
  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  // single lead chain — .select("*").eq(leadId).eq(orgId).single()
  const leadSingle = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadError ?? (leadRow ? null : { message: "No rows found" }),
  });
  const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
  const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
  const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { select: leadSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

// ---------------------------------------------------------------------------
// listLeads — authentication / org context
// ---------------------------------------------------------------------------

describe("listLeads — organization membership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when user is not a member of the org", async () => {
    mockForListLeads({ memberRow: null });

    await expect(listLeads(ORG_A, USER_1)).rejects.toThrow(TenantAccessError);
  });

  it("throws TenantAccessError for a valid user requesting a different org", async () => {
    // user-1 is a member of org-A but requests org-B
    mockForListLeads({ memberRow: null }); // no membership row for org-B

    await expect(listLeads(ORG_B, USER_1)).rejects.toThrow(TenantAccessError);
  });

  it("does not execute the leads query when membership check fails", async () => {
    const { from: fromSpy } = (() => {
      const memberSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Not found" },
      });
      const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
      const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
      const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });
      const fromSpy = vi.fn().mockReturnValue({ select: memberSelect });

      vi.mocked(createClient).mockResolvedValue({
        from: fromSpy,
      } as unknown as Awaited<ReturnType<typeof createClient>>);

      return { from: fromSpy };
    })();

    await expect(listLeads(ORG_A, USER_1)).rejects.toThrow(TenantAccessError);

    // from() was only called for organization_members (the auth check),
    // never for leads — the query was short-circuited.
    const calledTables = fromSpy.mock.calls.map((args) => args[0]);
    expect(calledTables).not.toContain("leads");
  });
});

// ---------------------------------------------------------------------------
// listLeads — successful retrieval
// ---------------------------------------------------------------------------

describe("listLeads — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns leads for the verified organization", async () => {
    const leads = [makeLeadRow(), makeLeadRow({ id: "lead-2", first_name: "Sara" })];
    mockForListLeads({ memberRow: makeMemberRow(), leadsRows: leads });

    const result = await listLeads(ORG_A, USER_1);

    expect(result).toHaveLength(2);
    expect(result[0]?.organization_id).toBe(ORG_A);
    expect(result[1]?.organization_id).toBe(ORG_A);
  });

  it("returns an empty array when the org has no leads", async () => {
    mockForListLeads({ memberRow: makeMemberRow(), leadsRows: [] });

    const result = await listLeads(ORG_A, USER_1);

    expect(result).toEqual([]);
  });

  it("returns leads with nullable email fields intact", async () => {
    mockForListLeads({
      memberRow: makeMemberRow(),
      leadsRows: [makeLeadRow({ email: null }), makeLeadRow({ email: "jane@example.com" })],
    });

    const result = await listLeads(ORG_A, USER_1);

    expect(result[0]?.email).toBeNull();
    expect(result[1]?.email).toBe("jane@example.com");
  });
});

// ---------------------------------------------------------------------------
// listLeads — database error handling
// ---------------------------------------------------------------------------

describe("listLeads — database error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws an error wrapping the DB error message when Supabase returns an error", async () => {
    mockForListLeads({
      memberRow: makeMemberRow(),
      leadsError: { message: "relation does not exist" },
    });

    await expect(listLeads(ORG_A, USER_1)).rejects.toThrow(
      "Failed to fetch leads"
    );
  });

  it("does not expose raw DB error details directly as a domain error type", async () => {
    mockForListLeads({
      memberRow: makeMemberRow(),
      leadsError: { message: "internal db error" },
    });

    let thrown: unknown;
    try {
      await listLeads(ORG_A, USER_1);
    } catch (e) {
      thrown = e;
    }

    // The error is a plain Error, not a typed domain error —
    // the raw DB message is wrapped but not surfaced as a specific AppError.
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
    expect(thrown).not.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// listLeads — tenant isolation: organizationId is always from the gate
// ---------------------------------------------------------------------------

describe("listLeads — tenant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the DB query to the verified organizationId, not a caller-supplied one", async () => {
    const leadsRange = vi.fn().mockResolvedValue({ data: [], error: null });
    const leadsOrder = vi.fn().mockReturnValue({ range: leadsRange });
    const leadsEqOrg = vi.fn().mockReturnValue({ order: leadsOrder });
    const leadsSelect = vi.fn().mockReturnValue({ eq: leadsEqOrg });

    const memberSingle = vi.fn().mockResolvedValue({
      data: makeMemberRow(),
      error: null,
    });
    const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
    const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
    const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "organization_members") return { select: memberSelect };
        if (table === "leads") return { select: leadsSelect };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await listLeads(ORG_A, USER_1);

    // Verify the leads query was scoped to ORG_A — the verified org.
    expect(leadsEqOrg).toHaveBeenCalledWith("organization_id", ORG_A);
  });
});

// ---------------------------------------------------------------------------
// getLead — organization membership gate
// ---------------------------------------------------------------------------

describe("getLead — organization membership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when user is not a member of the org", async () => {
    mockForGetLead({ memberRow: null });

    await expect(getLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(TenantAccessError);
  });

  it("throws TenantAccessError for a user requesting a lead in an org they don't belong to", async () => {
    mockForGetLead({ memberRow: null }); // no membership for org-B

    await expect(getLead(LEAD_1, ORG_B, USER_1)).rejects.toThrow(TenantAccessError);
  });
});

// ---------------------------------------------------------------------------
// getLead — successful retrieval
// ---------------------------------------------------------------------------

describe("getLead — successful retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the lead when it exists and belongs to the user's org", async () => {
    const lead = makeLeadRow();
    mockForGetLead({ memberRow: makeMemberRow(), leadRow: lead });

    const result = await getLead(LEAD_1, ORG_A, USER_1);

    expect(result.id).toBe(LEAD_1);
    expect(result.organization_id).toBe(ORG_A);
  });

  it("returns a lead with a null email (channel-agnostic)", async () => {
    const lead = makeLeadRow({ email: null });
    mockForGetLead({ memberRow: makeMemberRow(), leadRow: lead });

    const result = await getLead(LEAD_1, ORG_A, USER_1);

    expect(result.email).toBeNull();
    expect(result.phone).toBe("+974 55 123 456");
  });
});

// ---------------------------------------------------------------------------
// getLead — not-found and cross-tenant handling
// ---------------------------------------------------------------------------

describe("getLead — not-found and cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when the lead does not exist in the org", async () => {
    mockForGetLead({ memberRow: makeMemberRow(), leadRow: null });

    await expect(getLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError — not TenantAccessError — when a lead ID belongs to a different org", async () => {
    // The user IS a member of ORG_A.
    // LEAD_1 belongs to ORG_B (different tenant).
    // Because the query filters by BOTH id AND organization_id, the DB
    // returns no rows — the response is indistinguishable from "not found".
    // This prevents cross-tenant information leakage.
    mockForGetLead({ memberRow: makeMemberRow(), leadRow: null });

    let thrown: unknown;
    try {
      await getLead(LEAD_1, ORG_A, USER_1);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
    // Critically: the caller cannot distinguish "lead exists in another org"
    // from "lead does not exist at all".
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
  });

  it("does not return data when the DB returns null for a non-member lead", async () => {
    mockForGetLead({ memberRow: makeMemberRow(), leadRow: null });

    let threw = false;
    try {
      await getLead(LEAD_1, ORG_A, USER_1);
    } catch {
      threw = true;
    }

    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getLead — database error handling
// ---------------------------------------------------------------------------

describe("getLead — database error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws NotFoundError when Supabase returns an error (treats DB error as not-found)", async () => {
    // For single-row queries, any DB error (including PGRST116 "no rows")
    // is handled identically: the lead is treated as not accessible.
    mockForGetLead({
      memberRow: makeMemberRow(),
      leadRow: null,
      leadError: { message: "PGRST116" },
    });

    await expect(getLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Helper: mock for listLeads with optional filter support
//
// This mock extends the basic listLeads mock to support the conditional
// Supabase chain that includes .or() and .in() when filters are applied.
// ---------------------------------------------------------------------------

function mockForListLeadsFiltered({
  memberRow,
  leadsRows = [],
  leadsError = null,
}: {
  memberRow: Record<string, unknown> | null;
  leadsRows?: Record<string, unknown>[];
  leadsError?: { message: string } | null;
}) {
  // organization_members chain (unchanged from mockForListLeads)
  const memberSingle = vi.fn().mockResolvedValue({
    data: memberRow,
    error: memberRow ? null : { message: "Not found" },
  });
  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  // leads chain — supports optional .or() / .in() calls before .order()
  const leadsRange = vi.fn().mockResolvedValue({
    data: leadsRows,
    error: leadsError,
  });
  const leadsOrder = vi.fn().mockReturnValue({ range: leadsRange });

  // The filter chain object:  .or(), .in(), .is(), .eq() return themselves so
  // the test can verify the calls, then terminate with .order().range().
  const filterChain: {
    or: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } = {
    or: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    eq: vi.fn(),
    order: leadsOrder,
  };
  filterChain.or.mockReturnValue(filterChain);
  filterChain.in.mockReturnValue(filterChain);
  filterChain.is.mockReturnValue(filterChain);
  filterChain.eq.mockReturnValue(filterChain);

  const leadsEqOrg = vi.fn().mockReturnValue(filterChain);
  const leadsSelect = vi.fn().mockReturnValue({ eq: leadsEqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { select: leadsSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { leadsRange, leadsOrder, filterChain };
}

// ---------------------------------------------------------------------------
// listLeads — search filter
// ---------------------------------------------------------------------------

describe("listLeads — search filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls .or() with ilike patterns when search is provided", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { search: "ahmed" });

    expect(filterChain.or).toHaveBeenCalledOnce();
    const orArg = filterChain.or.mock.calls[0]?.[0] as string;
    expect(orArg).toContain("ilike.%ahmed%");
    expect(orArg).toContain("first_name");
    expect(orArg).toContain("last_name");
  });

  it("does not call .or() when search is undefined", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {});

    expect(filterChain.or).not.toHaveBeenCalled();
  });

  it("does not call .or() when search is only whitespace", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { search: "   " });

    expect(filterChain.or).not.toHaveBeenCalled();
  });

  it("escapes PostgreSQL wildcard characters in the search term", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { search: "50% off" });

    const orArg = filterChain.or.mock.calls[0]?.[0] as string;
    expect(orArg).toContain("50\\%");
  });
});

// ---------------------------------------------------------------------------
// listLeads — status and source filters
// ---------------------------------------------------------------------------

describe("listLeads — status filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls .in('status', [...]) when status filter is provided", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { status: ["qualified"] });

    expect(filterChain.in).toHaveBeenCalledWith("status", ["qualified"]);
  });

  it("passes multiple status values to .in()", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { status: ["new", "contacted"] });

    expect(filterChain.in).toHaveBeenCalledWith("status", ["new", "contacted"]);
  });

  it("does not call .in() for status when filter is undefined", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {});

    const statusCalls = filterChain.in.mock.calls.filter(([col]) => col === "status");
    expect(statusCalls).toHaveLength(0);
  });
});

describe("listLeads — source filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls .in('source', [...]) when source filter is provided", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { source: ["website"] });

    expect(filterChain.in).toHaveBeenCalledWith("source", ["website"]);
  });
});

// ---------------------------------------------------------------------------
// listLeads — sort options
// ---------------------------------------------------------------------------

describe("listLeads — sort options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts by created_at descending by default (no filter provided)", async () => {
    const { leadsOrder } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 });

    expect(leadsOrder).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("sorts ascending when sortOrder=asc is provided", async () => {
    const { leadsOrder } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { sortOrder: "asc" });

    expect(leadsOrder).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("uses sortBy field when provided", async () => {
    const { leadsOrder } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { sortBy: "first_name", sortOrder: "asc" });

    expect(leadsOrder).toHaveBeenCalledWith("first_name", { ascending: true });
  });

  it("sorts by score descending", async () => {
    const { leadsOrder } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { sortBy: "score", sortOrder: "desc" });

    expect(leadsOrder).toHaveBeenCalledWith("score", { ascending: false });
  });
});

// ---------------------------------------------------------------------------
// listLeads — owner filter (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_UUID = "owner111-0000-0000-0000-000000000001";

describe("listLeads — owner filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls .is('owner_id', null) when ownerId='unassigned'", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { ownerId: "unassigned" });

    expect(filterChain.is).toHaveBeenCalledWith("owner_id", null);
  });

  it("calls .eq('owner_id', uuid) when ownerId is a UUID", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, { ownerId: OWNER_UUID });

    expect(filterChain.eq).toHaveBeenCalledWith("owner_id", OWNER_UUID);
  });

  it("does not call .is() or owner .eq() when ownerId is not provided", async () => {
    const { filterChain } = mockForListLeadsFiltered({ memberRow: makeMemberRow() });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {});

    const ownerIsCalls = filterChain.is.mock.calls.filter(([col]) => col === "owner_id");
    const ownerEqCalls = filterChain.eq.mock.calls.filter(([col]) => col === "owner_id");
    expect(ownerIsCalls).toHaveLength(0);
    expect(ownerEqCalls).toHaveLength(0);
  });
});

describe("listLeads — excludeChannelStubs filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies the stub-heuristic or-filter when excludeChannelStubs is true", async () => {
    const { CHANNEL_STUB_LEAD_EXCLUDE_OR } = await import(
      "@/modules/channels/match"
    );
    const { filterChain } = mockForListLeadsFiltered({
      memberRow: makeMemberRow(),
    });

    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {
      excludeChannelStubs: true,
    });

    expect(filterChain.or).toHaveBeenCalledWith(CHANNEL_STUB_LEAD_EXCLUDE_OR);
  });

  it("does not apply the stub filter when excludeChannelStubs is omitted or false", async () => {
    const { CHANNEL_STUB_LEAD_EXCLUDE_OR } = await import(
      "@/modules/channels/match"
    );
    const omitted = mockForListLeadsFiltered({ memberRow: makeMemberRow() });
    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {});
    expect(omitted.filterChain.or).not.toHaveBeenCalled();

    const disabled = mockForListLeadsFiltered({ memberRow: makeMemberRow() });
    await listLeads(ORG_A, USER_1, { page: 1, limit: 20 }, {
      excludeChannelStubs: false,
    });
    expect(disabled.filterChain.or).not.toHaveBeenCalled();
    expect(disabled.filterChain.or).not.toHaveBeenCalledWith(
      CHANNEL_STUB_LEAD_EXCLUDE_OR
    );
  });
});
