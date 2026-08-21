import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_STATUS_LABELS,
  appointmentQueueBucket,
  isAppointmentOverdue,
} from "@/modules/appointments/lib/appointment-labels";

const NOW = new Date("2026-08-20T12:00:00Z");

describe("appointment status labels", () => {
  it("labels scheduled, completed, and cancelled", () => {
    expect(APPOINTMENT_STATUS_LABELS.scheduled).toBe("Scheduled");
    expect(APPOINTMENT_STATUS_LABELS.completed).toBe("Completed");
    expect(APPOINTMENT_STATUS_LABELS.cancelled).toBe("Cancelled");
  });
});

describe("isAppointmentOverdue", () => {
  it("is true for scheduled appointments whose starts_at is in the past", () => {
    expect(
      isAppointmentOverdue(
        { status: "scheduled", starts_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(true);
  });

  it("is false for future scheduled appointments", () => {
    expect(
      isAppointmentOverdue(
        { status: "scheduled", starts_at: "2026-08-22T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });

  it("is false for completed and cancelled appointments", () => {
    expect(
      isAppointmentOverdue(
        { status: "completed", starts_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(false);
    expect(
      isAppointmentOverdue(
        { status: "cancelled", starts_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe(false);
  });
});

describe("appointmentQueueBucket", () => {
  it("puts past-due scheduled items in overdue", () => {
    expect(
      appointmentQueueBucket(
        { status: "scheduled", starts_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe("overdue");
  });

  it("puts completed and cancelled items in done", () => {
    expect(
      appointmentQueueBucket(
        { status: "completed", starts_at: "2026-08-19T10:00:00Z" },
        NOW
      )
    ).toBe("done");
  });

  it("puts a future scheduled item after today in upcoming", () => {
    expect(
      appointmentQueueBucket(
        { status: "scheduled", starts_at: "2026-08-25T10:00:00Z" },
        NOW
      )
    ).toBe("upcoming");
  });
});
