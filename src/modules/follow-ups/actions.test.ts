/**
 * Follow-up domain mutation tests.
 *
 * NO LIVE DATABASE. Supabase, requireOrgMembership, and isMemberOfOrg are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundError, TenantAccessError, ValidationError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
  isMemberOfOrg: vi.fn(),
}));

vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  isMemberOfOrg,
  requireOrgMembership,
} from "@/modules/organizations/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import {
  createLeadFollowUp,
  updateLeadFollowUp,
} from "@/modules/follow-ups/actions";
import { FOLLOW_UP_TITLE_MAX, FOLLOW_UP_NOTES_MAX } from "@/modules/follow-ups/schema";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const USER_B = "bbbbbbbb-0000-4000-8000-0000000000bb";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const LEAD_2 = "22222222-2222-4222-8222-222222222222";
const FU_1 = "ffffffff-0000-4000-8000-000000000001";
const DUE_AT = "2026-08-22T10:00:00Z";

function makeFollowUp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: FU_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: "Discuss the two-bedroom option",
    due_at: new Date(DUE_AT).toISOString(),
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function validCreate(overrides: Record<string, unknown> = {}) {
  return {
    title: "Call Ahmed about the property",
    due_at: DUE_AT,
    ...overrides,
  };
}

function mockForCreate({
  leadRow = { id: LEAD_1 },
  insertedRow = null,
  insertError = null,
}: {
  leadRow?: Record<string, unknown> | null;
  insertedRow?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
} = {}) {
  const leadSingle = vi.fn().mockResolvedValue({
    data: leadRow,
    error: leadRow ? null : { message: "No rows" },
  });
  const leadEqOrg = vi.fn().mockReturnValue({ single: leadSingle });
  const leadEqId = vi.fn().mockReturnValue({ eq: leadEqOrg });
  const leadSelect = vi.fn().mockReturnValue({ eq: leadEqId });

  let capturedInsert: Record<string, unknown> | null = null;
  const insertSingle = vi.fn().mockResolvedValue({
    data: insertedRow,
    error: insertError ?? (insertedRow ? null : { message: "Insert failed" }),
  });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedInsert = payload;
    return { select: insertSelect };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "leads") return { select: leadSelect };
      if (table === "lead_follow_ups") return { insert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedInsert: () => capturedInsert, insert };
}

function mockForUpdate({
  currentRow = null,
  updatedRow = null,
  updateError = null,
}: {
  currentRow?: Record<string, unknown> | null;
  updatedRow?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
} = {}) {
  const getSingle = vi.fn().mockResolvedValue({
    data: currentRow,
    error: currentRow ? null : { message: "No rows" },
  });
  const getEqOrg = vi.fn().mockReturnValue({ single: getSingle });
  const getEqId = vi.fn().mockReturnValue({ eq: getEqOrg });
  const getSelect = vi.fn().mockReturnValue({ eq: getEqId });

  let capturedPatch: Record<string, unknown> | null = null;
  const updateSingle = vi.fn().mockResolvedValue({
    data: updatedRow,
    error: updateError ?? (updatedRow ? null : { message: "No rows" }),
  });
  const updateSelect = vi.fn().mockReturnValue({ single: updateSingle });
  const updateEqOrg = vi.fn().mockReturnValue({ select: updateSelect });
  const updateEqId = vi.fn().mockReturnValue({ eq: updateEqOrg });
  const update = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    capturedPatch = payload;
    return { eq: updateEqId };
  });

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "lead_follow_ups") return { select: getSelect, update };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedPatch: () => capturedPatch, update };
}

describe("createLeadFollowUp — membership and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate())
    ).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws ValidationError for a blank title", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate({ title: "  " }))
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for an oversized title", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createLeadFollowUp(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ title: "x".repeat(FOLLOW_UP_TITLE_MAX + 1) })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for oversized notes", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createLeadFollowUp(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ notes: "x".repeat(FOLLOW_UP_NOTES_MAX + 1) })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for an invalid timestamp", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate({ due_at: "nope" }))
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for a non-UUID assigned_user_id", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createLeadFollowUp(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ assigned_user_id: "not-a-uuid" })
      )
    ).rejects.toThrow(ValidationError);
  });
});

describe("createLeadFollowUp — assignee and lead isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("accepts a null assigned_user_id without membership lookup", async () => {
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
    mockForCreate({ insertedRow: makeFollowUp() });

    await createLeadFollowUp(
      ORG_A,
      USER_1,
      LEAD_1,
      validCreate({ assigned_user_id: null })
    );

    expect(isMemberOfOrg).not.toHaveBeenCalled();
  });

  it("accepts a same-org assigned_user_id", async () => {
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
    mockForCreate({
      insertedRow: makeFollowUp({ assigned_user_id: USER_1 }),
    });

    const result = await createLeadFollowUp(
      ORG_A,
      USER_1,
      LEAD_1,
      validCreate({ assigned_user_id: USER_1 })
    );

    expect(isMemberOfOrg).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(result.assigned_user_id).toBe(USER_1);
  });

  it("rejects a cross-org assigned_user_id with ValidationError", async () => {
    vi.mocked(isMemberOfOrg).mockResolvedValue(false);

    await expect(
      createLeadFollowUp(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ assigned_user_id: USER_B })
      )
    ).rejects.toThrow(ValidationError);

    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the lead is missing or cross-tenant", async () => {
    mockForCreate({ leadRow: null });

    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_2, validCreate())
    ).rejects.toThrow(NotFoundError);
  });
});

describe("createLeadFollowUp — field injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("injects organization_id and lead_id from verified context", async () => {
    const { getCapturedInsert } = mockForCreate({
      insertedRow: makeFollowUp(),
    });

    await createLeadFollowUp(ORG_A, USER_1, LEAD_1, {
      ...validCreate(),
      organization_id: ORG_B,
      lead_id: LEAD_2,
      user_id: USER_B,
      created_by: USER_B,
    });

    const payload = getCapturedInsert();
    expect(payload?.organization_id).toBe(ORG_A);
    expect(payload?.lead_id).toBe(LEAD_1);
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("created_by");
    expect(payload).not.toHaveProperty("idempotency_key");
  });

  it("does not let the client set status on create", async () => {
    const { getCapturedInsert } = mockForCreate({
      insertedRow: makeFollowUp(),
    });

    await createLeadFollowUp(ORG_A, USER_1, LEAD_1, {
      ...validCreate(),
      status: "completed",
    });

    expect(getCapturedInsert()).not.toHaveProperty("status");
  });

  it("returns the created follow-up", async () => {
    const row = makeFollowUp();
    mockForCreate({ insertedRow: row });
    const result = await createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate());
    expect(result).toMatchObject({
      id: FU_1,
      organization_id: ORG_A,
      lead_id: LEAD_1,
      status: "pending",
    });
  });

  it("replays an existing row on idempotency unique violation without a second activity", async () => {
    const existing = makeFollowUp();
    const leadSingle = vi.fn().mockResolvedValue({
      data: { id: LEAD_1 },
      error: null,
    });
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const existingSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
    const existingEqKey = vi.fn().mockReturnValue({ single: existingSingle });
    const existingEqOrg = vi.fn().mockReturnValue({ eq: existingEqKey });

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "leads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ single: leadSingle }),
              }),
            }),
          };
        }
        if (table === "lead_follow_ups") {
          return {
            insert: () => ({
              select: () => ({ single: insertSingle }),
            }),
            select: () => ({ eq: existingEqOrg }),
          };
        }
        return {};
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const result = await createLeadFollowUp(
      ORG_A,
      USER_1,
      LEAD_1,
      validCreate(),
      { idempotencyKey: "action-1" }
    );
    expect(result.id).toBe(FU_1);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});

describe("updateLeadFollowUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(TenantAccessError);
  });

  it("throws NotFoundError for a missing or cross-tenant follow-up", async () => {
    mockForUpdate({ currentRow: null });
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
  });

  it("completes a pending follow-up", async () => {
    const { getCapturedPatch } = mockForUpdate({
      currentRow: makeFollowUp(),
      updatedRow: makeFollowUp({ status: "completed" }),
    });

    const result = await updateLeadFollowUp(ORG_A, USER_1, FU_1, {
      status: "completed",
    });

    expect(getCapturedPatch()).toEqual({ status: "completed" });
    expect(result.status).toBe("completed");
  });

  it("cancels a pending follow-up", async () => {
    mockForUpdate({
      currentRow: makeFollowUp(),
      updatedRow: makeFollowUp({ status: "cancelled" }),
    });

    const result = await updateLeadFollowUp(ORG_A, USER_1, FU_1, {
      status: "cancelled",
    });

    expect(result.status).toBe("cancelled");
  });

  it("rejects completing an already completed follow-up", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ status: "completed" }),
    });

    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects cancelling an already cancelled follow-up", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ status: "cancelled" }),
    });

    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "cancelled" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects reopening via status pending", async () => {
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "pending" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects edits to a completed follow-up", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ status: "completed" }),
    });

    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { title: "Nope" })
    ).rejects.toThrow(ValidationError);
  });

  it("updates title, notes, due_at, and assigned_user_id on a pending follow-up", async () => {
    const { getCapturedPatch } = mockForUpdate({
      currentRow: makeFollowUp(),
      updatedRow: makeFollowUp({ title: "Rescheduled" }),
    });

    await updateLeadFollowUp(ORG_A, USER_1, FU_1, {
      title: "Rescheduled",
      notes: "",
      due_at: DUE_AT,
      assigned_user_id: USER_1,
    });

    expect(getCapturedPatch()).toMatchObject({
      title: "Rescheduled",
      notes: null,
      assigned_user_id: USER_1,
    });
  });

  it("rejects a cross-org assigned_user_id", async () => {
    vi.mocked(isMemberOfOrg).mockResolvedValue(false);
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { assigned_user_id: USER_B })
    ).rejects.toThrow(ValidationError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws ValidationError for an empty patch", async () => {
    await expect(updateLeadFollowUp(ORG_A, USER_1, FU_1, {})).rejects.toThrow(
      ValidationError
    );
  });
});

describe("createLeadFollowUp — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records one created activity with the follow-up title", async () => {
    mockForCreate({
      insertedRow: makeFollowUp({ title: "Call prospect" }),
    });
    await createLeadFollowUp(
      ORG_A,
      USER_1,
      LEAD_1,
      validCreate({ title: "Call prospect" })
    );
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "follow_up",
      content: "Follow-up created: Call prospect",
    });
  });

  it("bounds derived title content to the activity limit", async () => {
    const title = "x".repeat(FOLLOW_UP_TITLE_MAX);
    mockForCreate({ insertedRow: makeFollowUp({ title }) });
    await createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate({ title }));
    const content = vi.mocked(recordLeadActivity).mock.calls[0]?.[0].content;
    expect(content?.length).toBeLessThanOrEqual(2000);
    expect(content?.startsWith("Follow-up created: ")).toBe(true);
  });

  it("does not record an activity when create fails", async () => {
    mockForCreate({ insertError: { message: "insert failed" } });
    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_1, validCreate())
    ).rejects.toThrow(/Failed to create follow-up/);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a cross-tenant lead", async () => {
    mockForCreate({ leadRow: null });
    await expect(
      createLeadFollowUp(ORG_A, USER_1, LEAD_2, validCreate())
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});

describe("updateLeadFollowUp — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records completed when pending transitions to completed", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ title: "Call prospect" }),
      updatedRow: makeFollowUp({ title: "Call prospect", status: "completed" }),
    });
    await updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" });
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "follow_up",
      content: "Follow-up completed: Call prospect",
    });
  });

  it("records cancelled when pending transitions to cancelled", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ title: "Call prospect" }),
      updatedRow: makeFollowUp({ title: "Call prospect", status: "cancelled" }),
    });
    await updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "cancelled" });
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "follow_up",
      content: "Follow-up cancelled: Call prospect",
    });
  });

  it("does not record a lifecycle activity for unrelated field updates", async () => {
    mockForUpdate({
      currentRow: makeFollowUp(),
      updatedRow: makeFollowUp({ title: "Rescheduled", due_at: DUE_AT }),
    });
    await updateLeadFollowUp(ORG_A, USER_1, FU_1, {
      title: "Rescheduled",
      due_at: DUE_AT,
      assigned_user_id: USER_1,
    });
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record a duplicate when the same status cannot be applied again", async () => {
    mockForUpdate({
      currentRow: makeFollowUp({ status: "completed" }),
    });
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(ValidationError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity when the update fails", async () => {
    mockForUpdate({
      currentRow: makeFollowUp(),
      updateError: { message: "update failed" },
    });
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a cross-tenant follow-up", async () => {
    mockForUpdate({ currentRow: null });
    await expect(
      updateLeadFollowUp(ORG_A, USER_1, FU_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});
