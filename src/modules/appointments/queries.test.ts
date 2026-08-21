/**
 * Appointment domain query tests.
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
  listLeadAppointments,
  getAppointment,
  listAppointments,
  toAppointmentWithLead,
} from "@/modules/appointments/queries";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const LEAD_2 = "22222222-2222-4222-8222-222222222222";
const APPT_1 = "aaaaaaaa-0000-4000-8000-0000000000aa";

function makeAppointment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: APPT_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    starts_at: "2026-08-22T10:00:00Z",
    ends_at: "2026-08-22T11:00:00Z",
    status: "scheduled",
    location: "West Bay",
    notes: "Bring keys",
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
  const orderStarts = vi.fn().mockReturnValue({ order: orderId });
  const eqLead = vi.fn().mockReturnValue({ order: orderStarts });
  const eqOrg = vi.fn().mockReturnValue({ eq: eqLead });
  const select = vi.fn().mockReturnValue({ eq: eqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: lead.select };
      if (table === "appointments") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { range, orderStarts, orderId };
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
      if (table === "appointments") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { select };
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
  const orderStarts = vi.fn().mockReturnValue({ order: orderId });
  const orderStatus = vi.fn().mockReturnValue({ order: orderStarts });
  const filterChain: {
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    gte: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(),
    is: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    order: orderStatus,
  };
  filterChain.eq.mockReturnValue(filterChain);
  filterChain.is.mockReturnValue(filterChain);
  filterChain.gte.mockReturnValue(filterChain);
  filterChain.lte.mockReturnValue(filterChain);
  const select = vi.fn().mockReturnValue(filterChain);

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "appointments") return { select };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { filterChain, orderStatus, orderStarts, orderId, range, select };
}

describe("listLeadAppointments — membership and lead isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listLeadAppointments(ORG_A, USER_1, LEAD_1)).rejects.toThrow(
      TenantAccessError
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the lead is missing or cross-tenant", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    mockForListLead({ leadRow: null });
    await expect(listLeadAppointments(ORG_A, USER_1, LEAD_2)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe("listLeadAppointments — retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns an empty array when there are no appointments", async () => {
    mockForListLead({ rows: [] });
    await expect(listLeadAppointments(ORG_A, USER_1, LEAD_1)).resolves.toEqual(
      []
    );
  });

  it("returns appointments for the lead", async () => {
    mockForListLead({ rows: [makeAppointment()] });
    const result = await listLeadAppointments(ORG_A, USER_1, LEAD_1);
    expect(result[0]?.id).toBe(APPT_1);
  });

  it("orders by starts_at ASC then id ASC", async () => {
    const { orderStarts, orderId } = mockForListLead();
    await listLeadAppointments(ORG_A, USER_1, LEAD_1);
    expect(orderStarts).toHaveBeenCalledWith("starts_at", { ascending: true });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("applies pagination offsets", async () => {
    const { range } = mockForListLead();
    await listLeadAppointments(ORG_A, USER_1, LEAD_1, { page: 3, limit: 10 });
    expect(range).toHaveBeenCalledWith(20, 29);
  });

  it("propagates a database error", async () => {
    mockForListLead({ error: { message: "DB error" } });
    await expect(listLeadAppointments(ORG_A, USER_1, LEAD_1)).rejects.toThrow(
      "Failed to fetch appointments"
    );
  });
});

describe("getAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(getAppointment(ORG_A, USER_1, APPT_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("returns the appointment when it belongs to the organization", async () => {
    mockForGet({
      row: {
        ...makeAppointment(),
        lead: {
          id: LEAD_1,
          first_name: "Ahmed",
          last_name: "Ali",
          company_name: null,
        },
      },
    });
    const result = await getAppointment(ORG_A, USER_1, APPT_1);
    expect(result.id).toBe(APPT_1);
    expect(result.lead?.first_name).toBe("Ahmed");
  });

  it("throws NotFoundError when missing or cross-tenant", async () => {
    mockForGet({ row: null });
    await expect(getAppointment(ORG_A, USER_1, APPT_1)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe("listAppointments — org-wide queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(listAppointments(ORG_A, USER_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("embeds lead display fields", async () => {
    mockForListOrg({
      rows: [
        {
          ...makeAppointment(),
          lead: {
            id: LEAD_1,
            first_name: "Ahmed",
            last_name: "Ali",
            company_name: null,
          },
        },
      ],
    });
    const result = await listAppointments(ORG_A, USER_1);
    expect(result[0]?.lead).toEqual({
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    });
  });

  it("orders by status, starts_at, id", async () => {
    const { orderStatus, orderStarts, orderId } = mockForListOrg();
    await listAppointments(ORG_A, USER_1);
    expect(orderStatus).toHaveBeenCalledWith("status", { ascending: true });
    expect(orderStarts).toHaveBeenCalledWith("starts_at", { ascending: true });
    expect(orderId).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("filters by status, assignee, lead, and date bounds", async () => {
    const { filterChain } = mockForListOrg();
    await listAppointments(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      {
        status: "scheduled",
        assignedUserId: USER_1,
        leadId: LEAD_1,
        from: "2026-08-20T00:00:00Z",
        to: "2026-08-30T00:00:00Z",
      }
    );
    expect(filterChain.eq).toHaveBeenCalledWith("status", "scheduled");
    expect(filterChain.eq).toHaveBeenCalledWith("assigned_user_id", USER_1);
    expect(filterChain.eq).toHaveBeenCalledWith("lead_id", LEAD_1);
    expect(filterChain.gte).toHaveBeenCalledWith("starts_at", "2026-08-20T00:00:00Z");
    expect(filterChain.lte).toHaveBeenCalledWith("starts_at", "2026-08-30T00:00:00Z");
  });

  it("filters unassigned appointments", async () => {
    const { filterChain } = mockForListOrg();
    await listAppointments(
      ORG_A,
      USER_1,
      { page: 1, limit: 20 },
      { assignedUserId: "unassigned" }
    );
    expect(filterChain.is).toHaveBeenCalledWith("assigned_user_id", null);
  });

  it("applies pagination and propagates DB errors", async () => {
    const { range } = mockForListOrg();
    await listAppointments(ORG_A, USER_1, { page: 2, limit: 20 });
    expect(range).toHaveBeenCalledWith(20, 39);

    mockForListOrg({ error: { message: "DB error" } });
    await expect(listAppointments(ORG_A, USER_1)).rejects.toThrow(
      "Failed to fetch appointments"
    );
  });
});

describe("toAppointmentWithLead", () => {
  it("normalizes an array embed", () => {
    const result = toAppointmentWithLead({
      ...makeAppointment(),
      lead: [{ id: LEAD_1, first_name: "Ahmed", last_name: "Ali", company_name: "Acme" }],
    });
    expect(result.lead?.company_name).toBe("Acme");
  });

  it("returns null lead when missing", () => {
    expect(toAppointmentWithLead(makeAppointment()).lead).toBeNull();
  });
});
