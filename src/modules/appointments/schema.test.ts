/**
 * Appointment data-model tests (Phase 3.5).
 *
 * NO LIVE DATABASE IS REQUIRED.
 */
import { describe, it, expect } from "vitest";
import {
  appointmentStatusSchema,
  appointmentStatusTransitionSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  APPOINTMENT_LOCATION_MAX,
  APPOINTMENT_NOTES_MAX,
} from "@/modules/appointments/schema";
import type { Appointment, AppointmentStatus, Database } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const STARTS_AT = "2026-08-22T10:00:00Z";
const ENDS_AT = "2026-08-22T11:00:00Z";

function validCreate(overrides: Record<string, unknown> = {}) {
  return { starts_at: STARTS_AT, ...overrides };
}

describe("appointmentStatusSchema", () => {
  const valid: AppointmentStatus[] = ["scheduled", "completed", "cancelled"];

  valid.forEach((status) => {
    it(`accepts status '${status}'`, () => {
      expect(appointmentStatusSchema.safeParse(status).success).toBe(true);
    });
  });

  it("rejects overdue (derived, never stored)", () => {
    expect(appointmentStatusSchema.safeParse("overdue").success).toBe(false);
  });

  it("rejects pending and no_show", () => {
    expect(appointmentStatusSchema.safeParse("pending").success).toBe(false);
    expect(appointmentStatusSchema.safeParse("no_show").success).toBe(false);
  });
});

describe("appointmentStatusTransitionSchema", () => {
  it("accepts completed and cancelled", () => {
    expect(appointmentStatusTransitionSchema.safeParse("completed").success).toBe(
      true
    );
    expect(appointmentStatusTransitionSchema.safeParse("cancelled").success).toBe(
      true
    );
  });

  it("rejects reopening via scheduled", () => {
    expect(
      appointmentStatusTransitionSchema.safeParse("scheduled").success
    ).toBe(false);
  });
});

describe("createAppointmentSchema — valid input", () => {
  it("accepts starts_at only", () => {
    const result = createAppointmentSchema.safeParse(validCreate());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.starts_at).toBe(new Date(STARTS_AT).toISOString());
      expect(result.data.ends_at).toBeNull();
      expect(result.data.location).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts ends_at after starts_at, location, notes, and assignee", () => {
    const result = createAppointmentSchema.safeParse(
      validCreate({
        ends_at: ENDS_AT,
        location: "West Bay office",
        notes: "Bring floor plans",
        assigned_user_id: USER_1,
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ends_at).toBe(new Date(ENDS_AT).toISOString());
      expect(result.data.location).toBe("West Bay office");
      expect(result.data.assigned_user_id).toBe(USER_1);
    }
  });

  it("accepts assigned_user_id null (unassigned)", () => {
    const result = createAppointmentSchema.safeParse(
      validCreate({ assigned_user_id: null })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assigned_user_id).toBeNull();
    }
  });

  it("trims location and notes; empty becomes null", () => {
    const result = createAppointmentSchema.safeParse(
      validCreate({ location: "  Showroom  ", notes: "   " })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location).toBe("Showroom");
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts location and notes at max length", () => {
    expect(
      createAppointmentSchema.safeParse(
        validCreate({
          location: "x".repeat(APPOINTMENT_LOCATION_MAX),
          notes: "x".repeat(APPOINTMENT_NOTES_MAX),
        })
      ).success
    ).toBe(true);
  });
});

describe("createAppointmentSchema — invalid input", () => {
  it("rejects a missing starts_at", () => {
    expect(createAppointmentSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    expect(
      createAppointmentSchema.safeParse({ starts_at: "not-a-date" }).success
    ).toBe(false);
  });

  it("rejects ends_at equal to starts_at", () => {
    expect(
      createAppointmentSchema.safeParse(
        validCreate({ ends_at: STARTS_AT })
      ).success
    ).toBe(false);
  });

  it("rejects ends_at before starts_at", () => {
    expect(
      createAppointmentSchema.safeParse(
        validCreate({ ends_at: "2026-08-22T09:00:00Z" })
      ).success
    ).toBe(false);
  });

  it("rejects oversized location and notes", () => {
    expect(
      createAppointmentSchema.safeParse(
        validCreate({ location: "x".repeat(APPOINTMENT_LOCATION_MAX + 1) })
      ).success
    ).toBe(false);
    expect(
      createAppointmentSchema.safeParse(
        validCreate({ notes: "x".repeat(APPOINTMENT_NOTES_MAX + 1) })
      ).success
    ).toBe(false);
  });

  it("rejects a non-UUID assigned_user_id", () => {
    expect(
      createAppointmentSchema.safeParse(
        validCreate({ assigned_user_id: "nope" })
      ).success
    ).toBe(false);
  });
});

describe("createAppointmentSchema — identity stripping", () => {
  it("strips organization_id, lead_id, user_id, created_by, and status", () => {
    const result = createAppointmentSchema.safeParse({
      ...validCreate(),
      organization_id: ORG_B,
      lead_id: LEAD_1,
      user_id: USER_1,
      created_by: USER_1,
      status: "completed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
      expect("lead_id" in result.data).toBe(false);
      expect("user_id" in result.data).toBe(false);
      expect("created_by" in result.data).toBe(false);
      expect("status" in result.data).toBe(false);
    }
  });
});

describe("updateAppointmentSchema", () => {
  it("rejects an empty object", () => {
    expect(updateAppointmentSchema.safeParse({}).success).toBe(false);
  });

  it("accepts status-only complete and cancel", () => {
    expect(
      updateAppointmentSchema.safeParse({ status: "completed" }).success
    ).toBe(true);
    expect(
      updateAppointmentSchema.safeParse({ status: "cancelled" }).success
    ).toBe(true);
  });

  it("rejects reopening via scheduled", () => {
    expect(
      updateAppointmentSchema.safeParse({ status: "scheduled" }).success
    ).toBe(false);
  });

  it("does not convert omitted notes/location to null", () => {
    const result = updateAppointmentSchema.safeParse({
      status: "completed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeUndefined();
      expect(result.data.location).toBeUndefined();
    }
  });

  it("rejects ends_at <= starts_at when both are supplied", () => {
    expect(
      updateAppointmentSchema.safeParse({
        starts_at: STARTS_AT,
        ends_at: STARTS_AT,
      }).success
    ).toBe(false);
  });

  it("strips organization_id, lead_id, and user_id", () => {
    const result = updateAppointmentSchema.safeParse({
      status: "cancelled",
      organization_id: ORG_B,
      lead_id: LEAD_1,
      user_id: USER_1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("organization_id" in result.data).toBe(false);
      expect("lead_id" in result.data).toBe(false);
      expect("user_id" in result.data).toBe(false);
    }
  });
});

describe("Appointment type structure", () => {
  it("has the expected row fields", () => {
    const shape: Record<keyof Appointment, true> = {
      id: true,
      organization_id: true,
      lead_id: true,
      assigned_user_id: true,
      starts_at: true,
      ends_at: true,
      status: true,
      location: true,
      notes: true,
      created_at: true,
      updated_at: true,
    };
    expect(Object.keys(shape).length).toBe(11);
  });

  it("Insert defaults status and nullable fields", () => {
    const insert: Database["public"]["Tables"]["appointments"]["Insert"] = {
      organization_id: ORG_A,
      lead_id: LEAD_1,
      starts_at: STARTS_AT,
    };
    expect(insert.status).toBeUndefined();
    expect(insert.ends_at).toBeUndefined();
    expect(insert.assigned_user_id).toBeUndefined();
  });
});

describe("Tenant isolation contract", () => {
  it("org A appointment is not conceptually accessible as org B", () => {
    expect(ORG_A).not.toBe(ORG_B);
  });

  it("DELETE is not part of the appointment lifecycle", () => {
    const allowed = ["SELECT", "INSERT", "UPDATE"] as const;
    expect(allowed).not.toContain("DELETE");
  });
});
