/**
 * Lead activity domain query tests.
 *
 * Covers:
 *   - Application-layer tenant isolation (requireOrgMembership gate)
 *   - Lead-belongs-to-org verification before read/write
 *   - listLeadActivities: pagination, ordering, empty timeline
 *   - createLeadActivity: validation, cross-tenant rejection, field injection
 *   - Security: organization_id and user_id always from verified context
 *
 * NO LIVE DATABASE IS REQUIRED.
 * The Supabase client and requireOrgMembership are mocked throughout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError, NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// requireOrgMembership is called by the domain functions; mock it so we can
// test what happens when it throws vs. when it succeeds.
vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import {
  listLeadActivities,
  createLeadActivity,
  recordLeadActivity,
} from "@/modules/leads/activities/queries";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "user1111-0000-0000-0000-000000000001";
const LEAD_1 = "lead1111-0000-0000-0000-000000000001";
const LEAD_2 = "lead2222-0000-0000-0000-000000000002"; // belongs to ORG_B

function makeActivityRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "activ111-0000-0000-0000-000000000001",
    organization_id: ORG_A,
    lead_id: LEAD_1,
    user_id: USER_1,
    type: "note",
    content: "Called the lead — very interested.",
    created_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Sets up the Supabase mock for listLeadActivities:
 *   1. from("leads").select("id").eq(id).eq(org).single() — lead verification
 *   2. from("lead_activities").select("*").eq(org).eq(lead).order(...).range(...)
 */
function mockForList({
  leadRow = { id: LEAD_1 },
  leadError = null,
  activitiesRows = [],
  activitiesError = null,
}: {
  leadRow?: Record<string, unknown> | null;
  leadError?: { message: string } | null;
  activitiesRows?: Record<string, unknown>[];
  activitiesError?: { message: string } | null;
} = {}) {
  // leads lookup: .select("id").eq(id).eq(org).single()
  const leadSingle = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadError ?? (leadRow ? null : { message: "No rows found" }),
  });
  const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
  const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
  const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

  // activities list: .select("*").eq(org).eq(lead).order(...).range(...)
  const activitiesRange = vi.fn().mockResolvedValue({
    data: activitiesRows,
    error: activitiesError,
  });
  const activitiesOrder = vi.fn().mockReturnValue({ range: activitiesRange });
  const activitiesEqLead = vi.fn().mockReturnValue({ order: activitiesOrder });
  const activitiesEqOrg = vi.fn().mockReturnValue({ eq: activitiesEqLead });
  const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEqOrg });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: leadSelect };
      if (table === "lead_activities") return { select: activitiesSelect };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

/**
 * Sets up the Supabase mock for createLeadActivity:
 *   1. from("leads").select("id").eq(id).eq(org).single() — lead verification
 *   2. from("lead_activities").insert({...}).select().single() — insert
 */
function mockForCreate({
  leadRow = { id: LEAD_1 },
  leadError = null,
  insertedRow = null,
  insertError = null,
}: {
  leadRow?: Record<string, unknown> | null;
  leadError?: { message: string } | null;
  insertedRow?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
} = {}) {
  // leads lookup
  const leadSingle = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadError ?? (leadRow ? null : { message: "No rows found" }),
  });
  const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
  const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
  const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

  // activities insert: .insert({...}).select().single()
  const activitiesSingle = vi.fn().mockResolvedValue({
    data: insertedRow,
    error: insertError ?? (insertedRow ? null : { message: "Insert failed" }),
  });
  const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
  const activitiesInsert = vi.fn().mockReturnValue({ select: activitiesSelect });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: leadSelect };
      if (table === "lead_activities") return { insert: activitiesInsert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

// ---------------------------------------------------------------------------
// listLeadActivities — membership gate
// ---------------------------------------------------------------------------

describe("listLeadActivities — organization membership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when user is not a member of the org", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());

    await expect(
      listLeadActivities(ORG_A, USER_1, LEAD_1)
    ).rejects.toThrow(TenantAccessError);
  });

  it("does not query lead_activities when membership check fails", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());

    // createClient should never be called if requireOrgMembership throws
    await expect(listLeadActivities(ORG_A, USER_1, LEAD_1)).rejects.toThrow();
    expect(createClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listLeadActivities — lead-in-org verification
// ---------------------------------------------------------------------------

describe("listLeadActivities — lead belongs to organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws NotFoundError when lead does not exist", async () => {
    mockForList({ leadRow: null });

    await expect(
      listLeadActivities(ORG_A, USER_1, LEAD_1)
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when lead belongs to a different organization", async () => {
    // LEAD_2 belongs to ORG_B; querying it under ORG_A returns no row
    mockForList({ leadRow: null });

    await expect(
      listLeadActivities(ORG_A, USER_1, LEAD_2)
    ).rejects.toThrow(NotFoundError);
  });

  it("does not query lead_activities when lead verification fails", async () => {
    const activitiesRange = vi.fn();
    const activitiesOrder = vi.fn().mockReturnValue({ range: activitiesRange });
    const activitiesEqLead = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesEqOrg = vi.fn().mockReturnValue({ eq: activitiesEqLead });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEqOrg });

    const leadSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "No rows found" },
    });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { select: activitiesSelect };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(listLeadActivities(ORG_A, USER_1, LEAD_1)).rejects.toThrow(NotFoundError);
    expect(activitiesRange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// listLeadActivities — data retrieval
// ---------------------------------------------------------------------------

describe("listLeadActivities — data retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns an empty array when no activities exist", async () => {
    mockForList({ activitiesRows: [] });

    const result = await listLeadActivities(ORG_A, USER_1, LEAD_1);

    expect(result).toEqual([]);
  });

  it("returns the activities for the lead", async () => {
    const activity = makeActivityRow();
    mockForList({ activitiesRows: [activity] });

    const result = await listLeadActivities(ORG_A, USER_1, LEAD_1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: activity.id, type: "note" });
  });

  it("applies pagination correctly", async () => {
    mockForList({ activitiesRows: [] });

    // Get the range spy so we can assert the correct offset is passed
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesRange = vi.fn().mockResolvedValue({ data: [], error: null });
    const activitiesOrder = vi.fn().mockReturnValue({ range: activitiesRange });
    const activitiesEqLead = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesEqOrg = vi.fn().mockReturnValue({ eq: activitiesEqLead });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { select: activitiesSelect };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await listLeadActivities(ORG_A, USER_1, LEAD_1, { page: 3, limit: 10 });

    // page 3, limit 10 → offset = 20, end = 29
    expect(activitiesRange).toHaveBeenCalledWith(20, 29);
  });

  it("orders activities by created_at descending", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesRange = vi.fn().mockResolvedValue({ data: [], error: null });
    const activitiesOrder = vi.fn().mockReturnValue({ range: activitiesRange });
    const activitiesEqLead = vi.fn().mockReturnValue({ order: activitiesOrder });
    const activitiesEqOrg = vi.fn().mockReturnValue({ eq: activitiesEqLead });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEqOrg });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { select: activitiesSelect };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await listLeadActivities(ORG_A, USER_1, LEAD_1);

    expect(activitiesOrder).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  it("propagates a database error", async () => {
    mockForList({ activitiesError: { message: "DB error" } });

    await expect(
      listLeadActivities(ORG_A, USER_1, LEAD_1)
    ).rejects.toThrow("Failed to fetch activities");
  });
});

// ---------------------------------------------------------------------------
// createLeadActivity — membership gate
// ---------------------------------------------------------------------------

describe("createLeadActivity — organization membership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when user is not a member of the org", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());

    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "note", content: "Hello" })
    ).rejects.toThrow(TenantAccessError);
  });
});

// ---------------------------------------------------------------------------
// createLeadActivity — validation
// ---------------------------------------------------------------------------

describe("createLeadActivity — input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws ValidationError for an unrecognised activity type", async () => {
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "invalid_type", content: "Hi" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for empty content", async () => {
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "note", content: "" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for whitespace-only content", async () => {
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "note", content: "   " })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for content exceeding 2000 characters", async () => {
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type: "note",
        content: "x".repeat(2001),
      })
    ).rejects.toThrow(ValidationError);
  });

  it("accepts content at exactly the 2000-character boundary", async () => {
    mockForCreate({ insertedRow: makeActivityRow({ content: "x".repeat(2000) }) });

    const result = await createLeadActivity(ORG_A, USER_1, LEAD_1, {
      type: "note",
      content: "x".repeat(2000),
    });

    expect(result).toMatchObject({ type: "note" });
  });

  it("accepts all valid activity types", async () => {
    const validTypes = ["note", "call", "email", "meeting", "status_change"] as const;

    for (const type of validTypes) {
      mockForCreate({ insertedRow: makeActivityRow({ type }) });

      const result = await createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type,
        content: `A ${type} activity`,
      });

      expect(result).toMatchObject({ type });
    }
  });
});

// ---------------------------------------------------------------------------
// createLeadActivity — lead-in-org verification
// ---------------------------------------------------------------------------

describe("createLeadActivity — lead belongs to organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("throws NotFoundError when lead does not exist in this org", async () => {
    mockForCreate({ leadRow: null });

    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "note", content: "Hi" })
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects cross-org lead creation — lead from org B cannot receive org A activity", async () => {
    // LEAD_2 belongs to ORG_B; when looked up under ORG_A it returns no row
    mockForCreate({ leadRow: null });

    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_2, { type: "note", content: "Cross-org attempt" })
    ).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// createLeadActivity — field injection security
// ---------------------------------------------------------------------------

describe("createLeadActivity — server-side field injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("inserts organization_id from the verified context, not from input", async () => {
    const inserted = makeActivityRow();
    let capturedInsertPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    // Even if someone tried to supply organization_id in the input, the schema
    // strips it and the domain layer injects the verified value instead.
    // (input is unknown so no TS error — extra keys are silently dropped by Zod)
    await createLeadActivity(ORG_A, USER_1, LEAD_1, {
      type: "note",
      content: "Test note",
      organization_id: ORG_B,
      user_id: "malicious-user-id",
    });

    expect(capturedInsertPayload.organization_id).toBe(ORG_A);
    expect(capturedInsertPayload.user_id).toBe(USER_1);
  });

  it("inserts user_id from the authenticated session argument, not from input", async () => {
    const inserted = makeActivityRow();
    let capturedInsertPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await createLeadActivity(ORG_A, USER_1, LEAD_1, { type: "call", content: "Called them" });

    expect(capturedInsertPayload.user_id).toBe(USER_1);
  });

  it("inserts lead_id from the verified URL parameter, not from input", async () => {
    const inserted = makeActivityRow();
    let capturedInsertPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    // (input is unknown so no TS error — extra keys are silently dropped by Zod)
    await createLeadActivity(ORG_A, USER_1, LEAD_1, {
      type: "email",
      content: "Sent follow-up",
      lead_id: LEAD_2,
    });

    expect(capturedInsertPayload.lead_id).toBe(LEAD_1);
  });
});

// ---------------------------------------------------------------------------
// createLeadActivity — successful creation
// ---------------------------------------------------------------------------

describe("createLeadActivity — successful creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("returns the created activity row", async () => {
    const activity = makeActivityRow({ type: "meeting", content: "Scheduled a demo" });
    mockForCreate({ insertedRow: activity });

    const result = await createLeadActivity(ORG_A, USER_1, LEAD_1, {
      type: "meeting",
      content: "Scheduled a demo",
    });

    expect(result).toMatchObject({
      id: activity.id,
      organization_id: ORG_A,
      lead_id: LEAD_1,
      user_id: USER_1,
      type: "meeting",
      content: "Scheduled a demo",
    });
  });

  it("trims leading/trailing whitespace from content before insert", async () => {
    const inserted = makeActivityRow({ content: "Trimmed content" });
    let capturedPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await createLeadActivity(ORG_A, USER_1, LEAD_1, {
      type: "note",
      content: "  Trimmed content  ",
    });

    expect(capturedPayload.content).toBe("Trimmed content");
  });

  it("rejects conversation, follow_up, and appointment on the public create API", async () => {
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type: "conversation",
        content: "Conversation started",
      })
    ).rejects.toThrow(ValidationError);
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type: "follow_up",
        content: "Follow-up created: Call",
      })
    ).rejects.toThrow(ValidationError);
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type: "appointment",
        content: "Appointment scheduled",
      })
    ).rejects.toThrow(ValidationError);
    await expect(
      createLeadActivity(ORG_A, USER_1, LEAD_1, {
        type: "ai",
        content: "AI response generated",
      })
    ).rejects.toThrow(ValidationError);
    expect(createClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// recordLeadActivity — internal CRM event writer
// ---------------------------------------------------------------------------

describe("recordLeadActivity — membership and tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      recordLeadActivity({
        organizationId: ORG_A,
        userId: USER_1,
        leadId: LEAD_1,
        type: "conversation",
        content: "Conversation started",
      })
    ).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws NotFoundError for a cross-org lead", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    mockForCreate({ leadRow: null });
    await expect(
      recordLeadActivity({
        organizationId: ORG_A,
        userId: USER_1,
        leadId: LEAD_2,
        type: "follow_up",
        content: "Follow-up created: Call",
      })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("recordLeadActivity — trusted identity and types", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("injects organization_id and user_id from trusted arguments", async () => {
    const inserted = makeActivityRow({ type: "conversation" });
    let capturedInsertPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedInsertPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await recordLeadActivity({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "conversation",
      content: "Conversation started",
      ...({
        organization_id: ORG_B,
        user_id: "malicious-user-id",
        lead_id: LEAD_2,
      } as Record<string, unknown>),
    } as Parameters<typeof recordLeadActivity>[0]);

    expect(capturedInsertPayload.organization_id).toBe(ORG_A);
    expect(capturedInsertPayload.user_id).toBe(USER_1);
    expect(capturedInsertPayload.lead_id).toBe(LEAD_1);
  });

  it("accepts all supported activity types", async () => {
    const types = [
      "note",
      "call",
      "email",
      "meeting",
      "status_change",
      "conversation",
      "follow_up",
      "appointment",
      "ai",
    ] as const;

    for (const type of types) {
      mockForCreate({ insertedRow: makeActivityRow({ type }) });
      const result = await recordLeadActivity({
        organizationId: ORG_A,
        userId: USER_1,
        leadId: LEAD_1,
        type,
        content: `Recorded ${type}`,
      });
      expect(result).toMatchObject({ type });
    }
  });

  it("truncates oversized derived content instead of failing the insert", async () => {
    const inserted = makeActivityRow({ type: "follow_up", content: "x".repeat(2000) });
    let capturedPayload: Record<string, unknown> = {};

    const leadSingle = vi.fn().mockResolvedValue({ data: { id: LEAD_1 }, error: null });
    const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
    const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
    const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

    const activitiesSingle = vi.fn().mockResolvedValue({ data: inserted, error: null });
    const activitiesSelect = vi.fn().mockReturnValue({ single: activitiesSingle });
    const activitiesInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      capturedPayload = payload;
      return { select: activitiesSelect };
    });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") return { select: leadSelect };
        if (table === "lead_activities") return { insert: activitiesInsert };
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await recordLeadActivity({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "follow_up",
      content: "x".repeat(2500),
    });

    expect(String(capturedPayload.content)).toHaveLength(2000);
  });

  it("throws ValidationError for empty content", async () => {
    await expect(
      recordLeadActivity({
        organizationId: ORG_A,
        userId: USER_1,
        leadId: LEAD_1,
        type: "conversation",
        content: "   ",
      })
    ).rejects.toThrow(ValidationError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("propagates insert failures instead of swallowing them", async () => {
    mockForCreate({ insertError: { message: "insert failed" } });
    await expect(
      recordLeadActivity({
        organizationId: ORG_A,
        userId: USER_1,
        leadId: LEAD_1,
        type: "appointment",
        content: "Appointment scheduled",
      })
    ).rejects.toThrow(/Failed to create activity/);
  });
});
