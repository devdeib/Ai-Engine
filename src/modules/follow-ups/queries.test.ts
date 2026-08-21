/**
 * Follow-up domain query tests.
 *
 * NO LIVE DATABASE. Supabase and requireOrgMembership are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
  isMemberOfOrg: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  listLeadFollowUps,
  getLeadFollowUp,
  listFollowUps,
  toFollowUpWithLead,
} from "@/modules/follow-ups/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const LEAD_2 = "22222222-2222-4222-8222-222222222222";
const FU_1 = "ffffffff-0000-4000-8000-000000000001";

function makeFollowUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: FU_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: "Discuss the two-bedroom option",
    due_at: "2026-08-22T10:00:00Z",
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function mockLeadLookup(leadRow: Record<string, unknown> | null) {
  const single = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadRow ? null : { message: "No rows found" },
  });
  const eqOrg = vi.fn().mockReturnValue({ single });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const select = vi.fn().mockReturnValue({ eq: eqId });
  return { select };
}

function mockForListLead({
  leadRow = { id: LEAD_1 },
  rows = [],
  error = null,
}: {
  leadRow?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  error?: { message: string } | null;
} = {}) {
  const lead = mockLeadLookup(leadRow);

  const range = vi.fn().mockResolvedValue({ data: rows, error });
  const orderId = vi.fn().mockReturnValue({ range });
  const orderDue = vi.fn().mockReturnValue({ order: orderId });
  const orderStatus = vi.fn().mockReturnValue({ order: orderDue });
  const eqLead = vi.fn().mockReturnValue({ order: orderStatus });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqLead });
  const select = vi.fn().mockReturnValue({ eq: eqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: lead.select };
      if (table === "lead_follow_ups") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { range, orderStatus, orderDue, orderId, eqLead, eqOrg };
}

function mockForGet({
  row = null,
}: {
  row?: Record<string, unknown> | null;
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: row,
    error: row ? null : { message: "No rows" },
  });
  const eqOrg = vi.fn().mockReturnValue({ single });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  const select = vi.fn().mockReturnValue({ eq: eqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "lead_follow_ups") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

function mockForListOrg({
  rows = [],
  error = null,
}: {
  rows?: Record<string, unknown>[];
  error?: { message: string } | null;
} = {}) {
  const range = vi.fn().mockResolvedValue({ data: rows, error });
  const orderId = vi.fn().mockReturnValue({ range });
  const orderDue = vi.fn().mockReturnValue({ order: orderId });
  const orderStatus = vi.fn().mockReturnValue({ order: orderDue });
  const filterChain: {
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    lt: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    is: vi.fn(),
    lt: vi.fn(),
    order: orderStatus,
  };
  filterChain.eq.mockReturnValue(filterChain);
  filterChain.is.mockReturnValue(filterChain);
  filterChain.lt.mockReturnValue(filterChain);
  const select = vi.fn().mockReturnValue(filterChain);

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "lead_follow_ups") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { filterChain, orderStatus, orderDue, orderId, range, select };
}

describe("listLeadFollowUps — membership gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listLeadFollowUps(ORG_A, USER_1, LEAD_1)).rejects.toThrow(
      TenantAccessError
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("listLeadFollowUps — lead belongs to organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws NotFoundError when the lead does not exist", async () => {
    mockForListLead({ leadRow: null });
    await expect(listLeadFollowUps(ORG_A, USER_1, LEAD_1)).rejects.toThrow(
      NotFoundError
    );
  });

  it("throws NotFoundError when the lead belongs to another organization", async () => {
    mockForListLead({ leadRow: null });
    await expect(listLeadFollowUps(ORG_A, USER_1, LEAD_2)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe("listLeadFollowUps — retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns an empty array when the lead has no follow-ups", async () => {
    mockForListLead({ rows: [] });
    await expect(listLeadFollowUps(ORG_A, USER_1, LEAD_1)).resolves.toEqual([]);
  });

  it("returns follow-ups for the lead", async () => {
    const row = makeFollowUp();
    mockForListLead({ rows: [row] });
    const result = await listLeadFollowUps(ORG_A, USER_1, LEAD_1);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe(row.title);
  });

  it("orders by status ASC, due_at ASC, id ASC (pending first via enum order)", async () => {
    const { orderStatus, orderDue, orderId } = mockForListLead();
    await listLeadFollowUps(ORG_A, USER_1, LEAD_1);
    expect(orderStatus).toHaveBeenCalledWith("status", { ascending: true });
    expect(orderDue).toHaveBeenCalledWith("due_at", { ascending: true });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("applies pagination offsets", async () => {
    const { range } = mockForListLead();
    await listLeadFollowUps(ORG_A, USER_1, LEAD_1, { page: 3, limit: 10 });
    expect(range).toHaveBeenCalledWith(20, 29);
  });

  it("propagates a database error", async () => {
    mockForListLead({ error: { message: "DB error" } });
    await expect(listLeadFollowUps(ORG_A, USER_1, LEAD_1)).rejects.toThrow(
      "Failed to fetch follow-ups"
    );
  });
});

describe("getLeadFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(getLeadFollowUp(ORG_A, USER_1, FU_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("returns the follow-up when it belongs to the organization", async () => {
    mockForGet({ row: makeFollowUp() });
    const result = await getLeadFollowUp(ORG_A, USER_1, FU_1);
    expect(result.id).toBe(FU_1);
  });

  it("throws NotFoundError when the follow-up is missing or cross-tenant", async () => {
    mockForGet({ row: null });
    await expect(getLeadFollowUp(ORG_A, USER_1, FU_1)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe("listFollowUps — org-wide queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listFollowUps(ORG_A, USER_1)).rejects.toThrow(TenantAccessError);
  });

  it("returns follow-ups with embedded lead display fields", async () => {
    mockForListOrg({
      rows: [
        {
          ...makeFollowUp(),
          lead: {
            id: LEAD_1,
            first_name: "Ahmed",
            last_name: "Ali",
            company_name: null,
          },
        },
      ],
    });
    const result = await listFollowUps(ORG_A, USER_1);
    expect(result[0]?.lead).toEqual({
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    });
  });

  it("selects the lead embed", async () => {
    const { select } = mockForListOrg();
    await listFollowUps(ORG_A, USER_1);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("lead:leads"));
  });

  it("filters by status when provided", async () => {
    const { filterChain } = mockForListOrg();
    await listFollowUps(ORG_A, USER_1, { page: 1, limit: 20 }, { status: "pending" });
    expect(filterChain.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("filters unassigned follow-ups", async () => {
    const { filterChain } = mockForListOrg();
    await listFollowUps(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { assignedUserId: "unassigned" }
    );
    expect(filterChain.is).toHaveBeenCalledWith("assigned_user_id", null);
  });

  it("filters by assigned user", async () => {
    const { filterChain } = mockForListOrg();
    await listFollowUps(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { assignedUserId: USER_1 }
    );
    expect(filterChain.eq).toHaveBeenCalledWith("assigned_user_id", USER_1);
  });

  it("derives overdue as pending AND due_at < now", async () => {
    const { filterChain } = mockForListOrg();
    await listFollowUps(ORG_A, USER_1, { page: 1, limit: 20 }, { overdue: true });
    expect(filterChain.eq).toHaveBeenCalledWith("status", "pending");
    expect(filterChain.lt).toHaveBeenCalledWith(
      "due_at",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    );
  });

  it("applies pagination offsets", async () => {
    const { range } = mockForListOrg();
    await listFollowUps(ORG_A, USER_1, { page: 2, limit: 20 });
    expect(range).toHaveBeenCalledWith(20, 39);
  });

  it("propagates a database error", async () => {
    mockForListOrg({ error: { message: "DB error" } });
    await expect(listFollowUps(ORG_A, USER_1)).rejects.toThrow(
      "Failed to fetch follow-ups"
    );
  });
});

describe("toFollowUpWithLead", () => {
  it("normalizes an array embed to a single lead summary", () => {
    const result = toFollowUpWithLead({
      ...makeFollowUp(),
      lead: [
        {
          id: LEAD_1,
          first_name: "Ahmed",
          last_name: "Ali",
          company_name: "Acme",
        },
      ],
    });
    expect(result.lead).toEqual({
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: "Acme",
    });
  });

  it("returns null lead when the embed is missing", () => {
    const result = toFollowUpWithLead(makeFollowUp());
    expect(result.lead).toBeNull();
  });
});
