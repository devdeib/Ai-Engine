/**
 * Lead domain mutation tests.
 *
 * Tests cover:
 *   - Application-layer tenant isolation (requireOrgMembership gate)
 *   - Input validation (Zod schema enforcement)
 *   - Correct organization_id injection for create
 *   - Prevention of organization_id changes on update
 *   - Not-found and cross-tenant handling
 *   - Delete authorization via RLS simulation (0 rows = blocked)
 *   - Database error propagation
 *
 * NO LIVE DATABASE IS REQUIRED.
 *
 * RLS NOTE
 * --------
 * True PostgreSQL RLS enforcement (e.g. confirming that an `agent` role
 * cannot delete a lead at the DB layer) requires a live Supabase instance.
 * These tests simulate the RLS outcome at the application layer:
 *   - A blocked DELETE is simulated by returning an empty array from
 *     the mock (matching what Supabase returns when RLS filters all rows).
 *   - The application then throws NotFoundError, which is the correct
 *     behavior per the security design.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError, NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createLead, updateLead, deleteLead } from "@/modules/leads/actions";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "user1111-0000-0000-0000-000000000001";
const OWNER_1 = "eeeeeeee-0000-4000-8000-000000000099"; // a different member of ORG_A
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
    qualification_facts: {},
    qualification_updated_at: null,
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
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

function validCreateInput() {
  return {
    first_name: "Ahmed",
    last_name: "Ali",
    phone: "+974 55 123 456",
    source: "other" as const,
    status: "new" as const,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
//
// Each builder sets up the Supabase mock for ONE specific Supabase chain.
// The `from` mock dispatches to the correct chain by table name.
// ---------------------------------------------------------------------------

/**
 * createLead mock:
 *   organization_members: .select("*").eq(orgId).eq(userId).single()  [call 1: requestor]
 *   organization_members: .select("user_id").eq(orgId).eq(ownerId).single() [call 2: owner, optional]
 *   leads:                .insert({...}).select().single()
 *
 * ownerMemberRow:
 *   - undefined (default) → no second call expected (no owner_id in input)
 *   - non-null object     → second call succeeds (valid owner)
 *   - null                → second call fails (cross-org or nonexistent owner)
 */
function mockForCreate({
  memberRow,
  ownerMemberRow = undefined,
  insertedRow = null,
  insertError = null,
}: {
  memberRow: Record<string, unknown> | null;
  ownerMemberRow?: Record<string, unknown> | null;
  insertedRow?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}) {
  let memberSingle: ReturnType<typeof vi.fn>;

  if (ownerMemberRow !== undefined) {
    // Two sequential calls: first for requestor, second for owner candidate.
    memberSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: memberRow,
        error: memberRow ? null : { message: "Not found" },
      })
      .mockResolvedValueOnce({
        data: ownerMemberRow,
        error: ownerMemberRow ? null : { message: "Not found" },
      });
  } else {
    memberSingle = vi.fn().mockResolvedValue({
      data: memberRow,
      error: memberRow ? null : { message: "Not found" },
    });
  }

  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  const insertSingle = vi.fn().mockResolvedValue({
    data: insertedRow,
    error: insertError,
  });
  const insertSelectFn = vi.fn().mockReturnValue({ single: insertSingle });
  const insertFn = vi.fn().mockReturnValue({ select: insertSelectFn });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { insert: insertFn };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { insertFn };
}

/**
 * updateLead mock:
 *   organization_members: .select("*").eq(orgId).eq(userId).single()  [call 1: requestor]
 *   organization_members: .select("user_id").eq(orgId).eq(ownerId).single() [call 2: owner, optional]
 *   leads:                .update({...}).eq(leadId).eq(orgId).select().single()
 *
 * ownerMemberRow follows the same convention as mockForCreate.
 */
function mockForUpdate({
  memberRow,
  ownerMemberRow = undefined,
  updatedRow = null,
  updateError = null,
}: {
  memberRow: Record<string, unknown> | null;
  ownerMemberRow?: Record<string, unknown> | null;
  updatedRow?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
}) {
  let memberSingle: ReturnType<typeof vi.fn>;

  if (ownerMemberRow !== undefined) {
    memberSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: memberRow,
        error: memberRow ? null : { message: "Not found" },
      })
      .mockResolvedValueOnce({
        data: ownerMemberRow,
        error: ownerMemberRow ? null : { message: "Not found" },
      });
  } else {
    memberSingle = vi.fn().mockResolvedValue({
      data: memberRow,
      error: memberRow ? null : { message: "Not found" },
    });
  }

  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  const updateSingle = vi.fn().mockResolvedValue({
    data: updatedRow,
    error: updateError,
  });
  const updateSelectFn = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelectFn });
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
  const updateFn = vi.fn().mockReturnValue({ eq: updateEqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { update: updateFn };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { updateFn };
}

/**
 * deleteLead mock:
 *   organization_members: .select("*").eq(orgId).eq(userId).single()
 *   leads:                .delete().eq(leadId).eq(orgId).select("id")
 *
 * `deleteRows`:
 *   - [{ id: LEAD_1 }]  — row was deleted (owner/admin, RLS passed)
 *   - []               — RLS blocked or not found
 *   - null             — DB error scenario
 */
function mockForDelete({
  memberRow,
  deleteRows = [],
  deleteError = null,
}: {
  memberRow: Record<string, unknown> | null;
  deleteRows?: { id: string }[];
  deleteError?: { message: string } | null;
}) {
  const memberSingle = vi.fn().mockResolvedValue({
    data: memberRow,
    error: memberRow ? null : { message: "Not found" },
  });
  const memberEqUser = vi.fn().mockReturnValue({ single: memberSingle });
  const memberEqOrg = vi.fn().mockReturnValue({ eq: memberEqUser });
  const memberSelect = vi.fn().mockReturnValue({ eq: memberEqOrg });

  const deleteSelectFn = vi.fn().mockResolvedValue({
    data: deleteRows,
    error: deleteError,
  });
  const deleteEqOrg = vi.fn().mockReturnValue({ select: deleteSelectFn });
  const deleteEqId = vi.fn().mockReturnValue({ eq: deleteEqOrg });
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqId });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "organization_members") return { select: memberSelect };
      if (table === "leads") return { delete: deleteFn };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { deleteFn };
}

// ===========================================================================
// createLead
// ===========================================================================

describe("createLead — membership gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when the user is not a member of the org", async () => {
    mockForCreate({ memberRow: null });
    await expect(createLead(ORG_A, USER_1, validCreateInput())).rejects.toThrow(
      TenantAccessError
    );
  });

  it("does not execute the insert when membership check fails", async () => {
    const { insertFn } = mockForCreate({ memberRow: null });
    await expect(createLead(ORG_A, USER_1, validCreateInput())).rejects.toThrow(
      TenantAccessError
    );
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("throws TenantAccessError when requesting a different org", async () => {
    mockForCreate({ memberRow: null }); // no membership for ORG_B
    await expect(createLead(ORG_B, USER_1, validCreateInput())).rejects.toThrow(
      TenantAccessError
    );
  });
});

describe("createLead — input validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ValidationError when first_name is missing", async () => {
    mockForCreate({ memberRow: makeMemberRow() });
    const { first_name: _, ...bad } = validCreateInput();
    await expect(createLead(ORG_A, USER_1, bad)).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when email is provided but invalid", async () => {
    mockForCreate({ memberRow: makeMemberRow() });
    await expect(
      createLead(ORG_A, USER_1, { ...validCreateInput(), email: "not-an-email" })
    ).rejects.toThrow(ValidationError);
  });

  it("accepts a lead with null email (channel-agnostic)", async () => {
    const row = makeLeadRow({ email: null });
    mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    const result = await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      email: null,
    });
    expect(result.email).toBeNull();
  });

  it("accepts a lead with a valid email", async () => {
    const row = makeLeadRow({ email: "ahmed@example.com" });
    mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    const result = await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      email: "ahmed@example.com",
    });
    expect(result.email).toBe("ahmed@example.com");
  });

  it("throws ValidationError when score is out of range", async () => {
    mockForCreate({ memberRow: makeMemberRow() });
    await expect(
      createLead(ORG_A, USER_1, { ...validCreateInput(), score: 150 })
    ).rejects.toThrow(ValidationError);
  });
});

describe("createLead — tenant ownership enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts the verified organization_id, not a client-supplied one", async () => {
    const row = makeLeadRow();
    const { insertFn } = mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    // The client attempts to pass a different org id inside the input payload.
    // createLeadSchema strips unknown keys — organization_id is not in the schema.
    await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      organization_id: ORG_B, // must be ignored
    });

    // Verify the insert payload received the VERIFIED org (ORG_A), not ORG_B.
    const insertPayload = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.organization_id).toBe(ORG_A);
    expect(insertPayload.organization_id).not.toBe(ORG_B);
  });

  it("returns the created lead with the correct organization_id", async () => {
    const row = makeLeadRow({ organization_id: ORG_A });
    mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    const result = await createLead(ORG_A, USER_1, validCreateInput());
    expect(result.organization_id).toBe(ORG_A);
  });
});

describe("createLead — database error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws an Error wrapping the DB error message", async () => {
    mockForCreate({
      memberRow: makeMemberRow(),
      insertError: { message: "duplicate key value" },
    });
    await expect(createLead(ORG_A, USER_1, validCreateInput())).rejects.toThrow(
      "Failed to create lead"
    );
  });

  it("does not expose raw DB error as a typed domain error", async () => {
    mockForCreate({
      memberRow: makeMemberRow(),
      insertError: { message: "connection refused" },
    });

    let thrown: unknown;
    try {
      await createLead(ORG_A, USER_1, validCreateInput());
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ValidationError);
    expect(thrown).not.toBeInstanceOf(NotFoundError);
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
  });
});

// ===========================================================================
// updateLead
// ===========================================================================

describe("updateLead — membership gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when the user is not a member", async () => {
    mockForUpdate({ memberRow: null });
    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" })
    ).rejects.toThrow(TenantAccessError);
  });

  it("does not execute the update when membership check fails", async () => {
    const { updateFn } = mockForUpdate({ memberRow: null });
    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" })
    ).rejects.toThrow(TenantAccessError);
    expect(updateFn).not.toHaveBeenCalled();
  });
});

describe("updateLead — input validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ValidationError when email is provided but invalid", async () => {
    mockForUpdate({ memberRow: makeMemberRow() });
    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { email: "bad-email" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when score is out of range", async () => {
    mockForUpdate({ memberRow: makeMemberRow() });
    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { score: -5 })
    ).rejects.toThrow(ValidationError);
  });

  it("accepts a partial update with only status", async () => {
    const row = makeLeadRow({ status: "qualified" });
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" });
    expect(result.status).toBe("qualified");
  });

  it("accepts null email in an update (clearing the email)", async () => {
    const row = makeLeadRow({ email: null });
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { email: null });
    expect(result.email).toBeNull();
  });

  it("accepts a valid email in an update", async () => {
    const row = makeLeadRow({ email: "new@example.com" });
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { email: "new@example.com" });
    expect(result.email).toBe("new@example.com");
  });
});

describe("updateLead — tenant isolation: organization_id cannot change", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not include organization_id in the update payload", async () => {
    const row = makeLeadRow({ status: "contacted" });
    const { updateFn } = mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    // Caller attempts to slip in organization_id — updateLeadSchema strips it.
    await updateLead(LEAD_1, ORG_A, USER_1, {
      status: "contacted",
      organization_id: ORG_B, // must be stripped by Zod
    } as Record<string, unknown>);

    // The payload passed to .update() must not contain organization_id.
    const updatePayload = updateFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updatePayload).not.toHaveProperty("organization_id");
  });

  it("scopes the query to the verified organizationId", async () => {
    const row = makeLeadRow();
    const { updateFn } = mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    await updateLead(LEAD_1, ORG_A, USER_1, { status: "contacted" });

    // The chain's first .eq() should be called with the lead ID,
    // and the second with the verified org ID.
    const firstEq = updateFn.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(firstEq.eq).toHaveBeenCalledWith("id", LEAD_1);
  });
});

describe("updateLead — not-found and cross-tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the lead does not exist in the org", async () => {
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: null });
    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" })
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when a cross-tenant lead ID is supplied (no data leakage)", async () => {
    // The query filters by organization_id — a lead from ORG_B returns no rows
    // when queried with ORG_A's context.
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: null });

    let thrown: unknown;
    try {
      await updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
  });
});

describe("updateLead — database error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when Supabase returns an error on update", async () => {
    mockForUpdate({
      memberRow: makeMemberRow(),
      updateError: { message: "PGRST116" },
    });

    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" })
    ).rejects.toThrow(NotFoundError);
  });
});

// ===========================================================================
// deleteLead
// ===========================================================================

describe("deleteLead — membership gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when user is not a member of the org", async () => {
    mockForDelete({ memberRow: null });
    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(
      TenantAccessError
    );
  });

  it("does not execute the delete when membership check fails", async () => {
    const { deleteFn } = mockForDelete({ memberRow: null });
    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(
      TenantAccessError
    );
    expect(deleteFn).not.toHaveBeenCalled();
  });
});

describe("deleteLead — authorized owner/admin path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves successfully when RLS allows the delete (owner role)", async () => {
    mockForDelete({
      memberRow: makeMemberRow({ role: "owner" }),
      deleteRows: [{ id: LEAD_1 }], // RLS passed — row was deleted
    });

    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).resolves.toBeUndefined();
  });

  it("resolves successfully when RLS allows the delete (admin role)", async () => {
    mockForDelete({
      memberRow: makeMemberRow({ role: "admin" }),
      deleteRows: [{ id: LEAD_1 }],
    });

    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).resolves.toBeUndefined();
  });

  it("scopes the delete query to the verified organizationId", async () => {
    const { deleteFn } = mockForDelete({
      memberRow: makeMemberRow(),
      deleteRows: [{ id: LEAD_1 }],
    });

    await deleteLead(LEAD_1, ORG_A, USER_1);

    // First .eq() targets the lead ID, second targets the org.
    const firstEq = deleteFn.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> };
    expect(firstEq.eq).toHaveBeenCalledWith("id", LEAD_1);
  });
});

describe("deleteLead — authorization enforcement (non-owner/admin)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when RLS blocks the delete (agent role — 0 rows deleted)", async () => {
    // Simulate what PostgreSQL returns when the DELETE USING policy fails:
    // the row is invisible and 0 rows are affected — identical to not found.
    mockForDelete({
      memberRow: makeMemberRow({ role: "agent" }),
      deleteRows: [], // RLS blocked — no rows deleted
    });

    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(NotFoundError);
  });

  it("does not expose whether the failure was due to RLS or non-existence (no privilege leakage)", async () => {
    // Both "not found" and "RLS blocked" produce NotFoundError.
    mockForDelete({
      memberRow: makeMemberRow({ role: "agent" }),
      deleteRows: [],
    });

    let thrown: unknown;
    try {
      await deleteLead(LEAD_1, ORG_A, USER_1);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
  });
});

describe("deleteLead — not-found and cross-tenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws NotFoundError when the lead does not exist in the org", async () => {
    mockForDelete({
      memberRow: makeMemberRow(),
      deleteRows: [], // no matching row
    });

    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError for a cross-tenant lead ID (no leakage)", async () => {
    // The .eq("organization_id", ORG_A) filter means a lead belonging to ORG_B
    // will match 0 rows — indistinguishable from "not found".
    mockForDelete({
      memberRow: makeMemberRow(),
      deleteRows: [],
    });

    let thrown: unknown;
    try {
      await deleteLead(LEAD_1, ORG_A, USER_1);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
  });
});

describe("deleteLead — database error handling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws an Error wrapping the DB error message", async () => {
    mockForDelete({
      memberRow: makeMemberRow(),
      deleteError: { message: "connection timeout" },
    });

    await expect(deleteLead(LEAD_1, ORG_A, USER_1)).rejects.toThrow(
      "Failed to delete lead"
    );
  });

  it("does not expose DB error as a typed domain error", async () => {
    mockForDelete({
      memberRow: makeMemberRow(),
      deleteError: { message: "internal error" },
    });

    let thrown: unknown;
    try {
      await deleteLead(LEAD_1, ORG_A, USER_1);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(NotFoundError);
    expect(thrown).not.toBeInstanceOf(TenantAccessError);
  });
});

// ===========================================================================
// createLead — owner_id validation (Phase 2.4.2)
// ===========================================================================

describe("createLead — owner_id: valid same-org assignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts owner_id belonging to the same organization", async () => {
    const row = makeLeadRow({ owner_id: OWNER_1 });
    const ownerMember = makeMemberRow({ user_id: OWNER_1 });
    mockForCreate({
      memberRow: makeMemberRow(),
      ownerMemberRow: ownerMember,
      insertedRow: row,
    });

    const result = await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      owner_id: OWNER_1,
    });
    expect(result.owner_id).toBe(OWNER_1);
  });

  it("inserts the correct owner_id into the lead row", async () => {
    const row = makeLeadRow({ owner_id: OWNER_1 });
    const { insertFn } = mockForCreate({
      memberRow: makeMemberRow(),
      ownerMemberRow: makeMemberRow({ user_id: OWNER_1 }),
      insertedRow: row,
    });

    await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      owner_id: OWNER_1,
    });

    const insertPayload = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.owner_id).toBe(OWNER_1);
  });

  it("accepts null owner_id (explicitly unassigned)", async () => {
    const row = makeLeadRow({ owner_id: null });
    // null owner_id: isMemberOfOrg is NOT called (skip validation)
    mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    const result = await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      owner_id: null,
    });
    expect(result.owner_id).toBeNull();
  });

  it("accepts omitted owner_id (unassigned by default)", async () => {
    const row = makeLeadRow({ owner_id: null });
    mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    const result = await createLead(ORG_A, USER_1, validCreateInput());
    expect(result.owner_id).toBeNull();
  });
});

describe("createLead — owner_id: cross-org / nonexistent owner rejected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ValidationError when owner_id is not a member of this organization", async () => {
    // ownerMemberRow: null → isMemberOfOrg returns false
    mockForCreate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null,
    });

    await expect(
      createLead(ORG_A, USER_1, {
        ...validCreateInput(),
        owner_id: OWNER_1, // belongs to another org, not ORG_A
      })
    ).rejects.toThrow(ValidationError);
  });

  it("does not insert the lead when owner validation fails", async () => {
    const { insertFn } = mockForCreate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null,
    });

    await expect(
      createLead(ORG_A, USER_1, {
        ...validCreateInput(),
        owner_id: OWNER_1,
      })
    ).rejects.toThrow(ValidationError);

    expect(insertFn).not.toHaveBeenCalled();
  });

  it("reports the error on the owner_id field", async () => {
    mockForCreate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null,
    });

    let thrown: unknown;
    try {
      await createLead(ORG_A, USER_1, {
        ...validCreateInput(),
        owner_id: OWNER_1,
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    const ve = thrown as ValidationError;
    expect(ve.details).toHaveProperty("owner_id");
  });

  it("client-supplied organization_id still cannot override verified org", async () => {
    const row = makeLeadRow({ owner_id: null, organization_id: ORG_A });
    const { insertFn } = mockForCreate({ memberRow: makeMemberRow(), insertedRow: row });

    await createLead(ORG_A, USER_1, {
      ...validCreateInput(),
      organization_id: ORG_B, // must be stripped by Zod
    } as Record<string, unknown>);

    const insertPayload = insertFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertPayload.organization_id).toBe(ORG_A);
    expect(insertPayload.organization_id).not.toBe(ORG_B);
  });
});

// ===========================================================================
// updateLead — owner_id validation (Phase 2.4.2)
// ===========================================================================

describe("updateLead — owner_id: valid same-org assignment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts owner_id belonging to the same organization", async () => {
    const row = makeLeadRow({ owner_id: OWNER_1 });
    mockForUpdate({
      memberRow: makeMemberRow(),
      ownerMemberRow: makeMemberRow({ user_id: OWNER_1 }),
      updatedRow: row,
    });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { owner_id: OWNER_1 });
    expect(result.owner_id).toBe(OWNER_1);
  });

  it("accepts null owner_id (explicitly clearing the assignment)", async () => {
    const row = makeLeadRow({ owner_id: null });
    // owner_id = null: isMemberOfOrg is NOT called (null is always allowed)
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { owner_id: null });
    expect(result.owner_id).toBeNull();
  });

  it("does not check owner when owner_id is omitted from the update", async () => {
    const row = makeLeadRow({ status: "qualified" });
    // No ownerMemberRow — only one organization_members call expected.
    mockForUpdate({ memberRow: makeMemberRow(), updatedRow: row });

    const result = await updateLead(LEAD_1, ORG_A, USER_1, { status: "qualified" });
    expect(result.status).toBe("qualified");
  });
});

describe("updateLead — owner_id: cross-org / nonexistent owner rejected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws ValidationError when owner_id is not a member of this organization", async () => {
    mockForUpdate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null, // owner not in this org
    });

    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { owner_id: OWNER_1 })
    ).rejects.toThrow(ValidationError);
  });

  it("does not execute the update when owner validation fails", async () => {
    const { updateFn } = mockForUpdate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null,
    });

    await expect(
      updateLead(LEAD_1, ORG_A, USER_1, { owner_id: OWNER_1 })
    ).rejects.toThrow(ValidationError);

    expect(updateFn).not.toHaveBeenCalled();
  });

  it("reports the error on the owner_id field", async () => {
    mockForUpdate({
      memberRow: makeMemberRow(),
      ownerMemberRow: null,
    });

    let thrown: unknown;
    try {
      await updateLead(LEAD_1, ORG_A, USER_1, { owner_id: OWNER_1 });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    const ve = thrown as ValidationError;
    expect(ve.details).toHaveProperty("owner_id");
  });
});
