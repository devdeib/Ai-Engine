/**
 * Appointment domain mutation tests.
 * NO LIVE DATABASE.
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
  createAppointment,
  updateAppointment,
} from "@/modules/appointments/actions";
import {
  APPOINTMENT_LOCATION_MAX,
  APPOINTMENT_NOTES_MAX,
} from "@/modules/appointments/schema";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const USER_B = "bbbbbbbb-0000-4000-8000-0000000000bb";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const LEAD_2 = "22222222-2222-4222-8222-222222222222";
const APPT_1 = "aaaaaaaa-0000-4000-8000-0000000000aa";
const STARTS_AT = "2026-08-22T10:00:00Z";
const ENDS_AT = "2026-08-22T11:00:00Z";

function makeAppointment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: APPT_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    assigned_user_id: null,
    starts_at: new Date(STARTS_AT).toISOString(),
    ends_at: new Date(ENDS_AT).toISOString(),
    status: "scheduled",
    location: "West Bay",
    notes: null,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function validCreate(overrides: Record<string, unknown> = {}) {
  return { starts_at: STARTS_AT, ...overrides };
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
      if (table === "appointments") return { insert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedInsert: () => capturedInsert };
}

function mockForUpdate({
  currentRow = null,
  updatedRow = null,
}: {
  currentRow?: Record<string, unknown> | null;
  updatedRow?: Record<string, unknown> | null;
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
    error: updatedRow ? null : { message: "No rows" },
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
      if (table === "appointments") return { select: getSelect, update };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { getCapturedPatch: () => capturedPatch };
}

describe("createAppointment — membership and validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      createAppointment(ORG_A, USER_1, LEAD_1, validCreate())
    ).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws ValidationError for an invalid timestamp", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createAppointment(ORG_A, USER_1, LEAD_1, { starts_at: "nope" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when ends_at is not after starts_at", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createAppointment(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ ends_at: STARTS_AT })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for oversized location and notes", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    await expect(
      createAppointment(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ location: "x".repeat(APPOINTMENT_LOCATION_MAX + 1) })
      )
    ).rejects.toThrow(ValidationError);
    await expect(
      createAppointment(
        ORG_A,
        USER_1,
        LEAD_1,
        validCreate({ notes: "x".repeat(APPOINTMENT_NOTES_MAX + 1) })
      )
    ).rejects.toThrow(ValidationError);
  });
});

describe("createAppointment — assignee and lead isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("accepts a null assigned_user_id without membership lookup", async () => {
    mockForCreate({ insertedRow: makeAppointment() });
    await createAppointment(
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
      insertedRow: makeAppointment({ assigned_user_id: USER_1 }),
    });
    const result = await createAppointment(
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
      createAppointment(
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
      createAppointment(ORG_A, USER_1, LEAD_2, validCreate())
    ).rejects.toThrow(NotFoundError);
  });
});

describe("createAppointment — field injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
  });

  it("injects organization_id and lead_id from verified context", async () => {
    const { getCapturedInsert } = mockForCreate({
      insertedRow: makeAppointment(),
    });
    await createAppointment(ORG_A, USER_1, LEAD_1, {
      ...validCreate(),
      organization_id: ORG_B,
      lead_id: LEAD_2,
      user_id: USER_B,
      status: "completed",
    });
    const payload = getCapturedInsert();
    expect(payload?.organization_id).toBe(ORG_A);
    expect(payload?.lead_id).toBe(LEAD_1);
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("status");
  });

  it("returns the created appointment", async () => {
    mockForCreate({ insertedRow: makeAppointment() });
    const result = await createAppointment(ORG_A, USER_1, LEAD_1, validCreate());
    expect(result).toMatchObject({
      id: APPT_1,
      organization_id: ORG_A,
      status: "scheduled",
    });
  });
});

describe("updateAppointment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
  });

  it("throws TenantAccessError when the user is not a member", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" })
    ).rejects.toThrow(TenantAccessError);
  });

  it("throws NotFoundError for a missing or cross-tenant appointment", async () => {
    mockForUpdate({ currentRow: null });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
  });

  it("completes and cancels a scheduled appointment", async () => {
    mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ status: "completed" }),
    });
    const completed = await updateAppointment(ORG_A, USER_1, APPT_1, {
      status: "completed",
    });
    expect(completed.status).toBe("completed");

    mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ status: "cancelled" }),
    });
    const cancelled = await updateAppointment(ORG_A, USER_1, APPT_1, {
      status: "cancelled",
    });
    expect(cancelled.status).toBe("cancelled");
  });

  it("rejects updates to completed or cancelled appointments", async () => {
    mockForUpdate({ currentRow: makeAppointment({ status: "completed" }) });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "cancelled" })
    ).rejects.toThrow(ValidationError);

    mockForUpdate({ currentRow: makeAppointment({ status: "cancelled" }) });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { location: "Nope" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects reopening via status scheduled", async () => {
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "scheduled" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects ends_at that is not after the resulting starts_at", async () => {
    mockForUpdate({ currentRow: makeAppointment() });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, {
        ends_at: "2026-08-22T09:00:00Z",
      })
    ).rejects.toThrow(ValidationError);
  });

  it("updates fields on a scheduled appointment", async () => {
    const { getCapturedPatch } = mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ location: "Marina" }),
    });
    await updateAppointment(ORG_A, USER_1, APPT_1, {
      location: "Marina",
      notes: "",
      assigned_user_id: USER_1,
    });
    expect(getCapturedPatch()).toMatchObject({
      location: "Marina",
      notes: null,
      assigned_user_id: USER_1,
    });
  });

  it("rejects a cross-org assigned_user_id", async () => {
    vi.mocked(isMemberOfOrg).mockResolvedValue(false);
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { assigned_user_id: USER_B })
    ).rejects.toThrow(ValidationError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("throws ValidationError for an empty patch", async () => {
    await expect(updateAppointment(ORG_A, USER_1, APPT_1, {})).rejects.toThrow(
      ValidationError
    );
  });
});

describe("createAppointment — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records one scheduled activity after a successful create", async () => {
    mockForCreate({ insertedRow: makeAppointment() });
    await createAppointment(ORG_A, USER_1, LEAD_1, validCreate());
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "appointment",
      content: "Appointment scheduled",
    });
  });

  it("does not record an activity when create fails", async () => {
    mockForCreate({ insertError: { message: "insert failed" } });
    await expect(
      createAppointment(ORG_A, USER_1, LEAD_1, validCreate())
    ).rejects.toThrow(/Failed to create appointment/);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a cross-tenant lead", async () => {
    mockForCreate({ leadRow: null });
    await expect(
      createAppointment(ORG_A, USER_1, LEAD_2, validCreate())
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});

describe("updateAppointment — activity wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgMembership).mockResolvedValue({} as never);
    vi.mocked(isMemberOfOrg).mockResolvedValue(true);
    vi.mocked(recordLeadActivity).mockResolvedValue({} as never);
  });

  it("records completed when scheduled transitions to completed", async () => {
    mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ status: "completed" }),
    });
    await updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" });
    expect(recordLeadActivity).toHaveBeenCalledTimes(1);
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "appointment",
      content: "Appointment completed",
    });
  });

  it("records cancelled when scheduled transitions to cancelled", async () => {
    mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ status: "cancelled" }),
    });
    await updateAppointment(ORG_A, USER_1, APPT_1, { status: "cancelled" });
    expect(recordLeadActivity).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      leadId: LEAD_1,
      type: "appointment",
      content: "Appointment cancelled",
    });
  });

  it("does not record a lifecycle activity for unrelated field updates", async () => {
    mockForUpdate({
      currentRow: makeAppointment(),
      updatedRow: makeAppointment({ location: "Marina" }),
    });
    await updateAppointment(ORG_A, USER_1, APPT_1, {
      location: "Marina",
      notes: "Bring keys",
      assigned_user_id: USER_1,
    });
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record a duplicate when the same status cannot be applied again", async () => {
    mockForUpdate({
      currentRow: makeAppointment({ status: "completed" }),
    });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" })
    ).rejects.toThrow(ValidationError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity when the update fails", async () => {
    mockForUpdate({ currentRow: makeAppointment(), updatedRow: null });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("does not record an activity for a cross-tenant appointment", async () => {
    mockForUpdate({ currentRow: null });
    await expect(
      updateAppointment(ORG_A, USER_1, APPT_1, { status: "completed" })
    ).rejects.toThrow(NotFoundError);
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });
});
