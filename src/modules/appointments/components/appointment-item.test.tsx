import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppointmentItem } from "./appointment-item";
import type { Appointment } from "@/lib/db/types";

const NOW = new Date("2026-08-20T12:00:00Z");

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "aaaaaaaa-0000-4000-8000-0000000000aa",
    organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
    lead_id: "11111111-1111-4111-8111-111111111111",
    assigned_user_id: null,
    starts_at: "2026-08-22T10:00:00Z",
    ends_at: "2026-08-22T11:00:00Z",
    status: "scheduled",
    location: "West Bay office",
    notes: "Bring floor plans",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

describe("AppointmentItem", () => {
  it("renders location, times, notes, and unassigned state", () => {
    render(
      <AppointmentItem
        appointment={makeAppointment()}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("West Bay office")).toBeInTheDocument();
    expect(screen.getByText("Bring floor plans")).toBeInTheDocument();
    expect(screen.getByText(/Unassigned/)).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(document.querySelectorAll("time")).toHaveLength(2);
  });

  it("falls back to Appointment when location is missing", () => {
    render(
      <AppointmentItem
        appointment={makeAppointment({ location: null })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("Appointment")).toBeInTheDocument();
  });

  it("shows Overdue for past scheduled appointments", () => {
    render(
      <AppointmentItem
        appointment={makeAppointment({ starts_at: "2026-08-19T10:00:00Z" })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("hides actions for completed and cancelled appointments", () => {
    const { rerender } = render(
      <AppointmentItem
        appointment={makeAppointment({ status: "completed" })}
        assigneeName="Sara Khan"
        now={NOW}
      />
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();

    rerender(
      <AppointmentItem
        appointment={makeAppointment({ status: "cancelled" })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("calls complete, cancel, and edit handlers", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    const onEdit = vi.fn();
    render(
      <AppointmentItem
        appointment={makeAppointment()}
        assigneeName={null}
        now={NOW}
        onComplete={onComplete}
        onCancel={onCancel}
        onEdit={onEdit}
      />
    );
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(onComplete).toHaveBeenCalledWith("aaaaaaaa-0000-4000-8000-0000000000aa");
    expect(onCancel).toHaveBeenCalledWith("aaaaaaaa-0000-4000-8000-0000000000aa");
    expect(onEdit).toHaveBeenCalledWith("aaaaaaaa-0000-4000-8000-0000000000aa");
  });
});
