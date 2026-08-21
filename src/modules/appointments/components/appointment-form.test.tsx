import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import {
  AppointmentForm,
  datetimeLocalToIso,
} from "./appointment-form";

const MEMBERS = [
  { user_id: "00000000-0000-4000-8000-000000000001", display_name: "Sara Khan" },
];

describe("datetimeLocalToIso", () => {
  it("returns null for an empty value", () => {
    expect(datetimeLocalToIso("")).toBeNull();
  });

  it("returns an ISO timestamp", () => {
    expect(datetimeLocalToIso("2026-08-22T10:00")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("AppointmentForm", () => {
  it("renders start, end, assignee, location, and notes", () => {
    render(<AppointmentForm members={MEMBERS} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("End")).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned to")).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sara Khan" })).toBeInTheDocument();
  });

  it("disables submit until a start time is set", () => {
    render(<AppointmentForm members={MEMBERS} onSubmit={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Schedule appointment" })
    ).toBeDisabled();
  });

  it("submits ISO timestamps and selected member", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AppointmentForm members={MEMBERS} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-08-22T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "2026-08-22T11:00" },
    });
    await user.selectOptions(screen.getByLabelText("Assigned to"), MEMBERS[0]!.user_id);
    await user.type(screen.getByLabelText("Location"), "Marina");
    await user.click(screen.getByRole("button", { name: "Schedule appointment" }));

    expect(onSubmit).toHaveBeenCalledWith({
      starts_at: datetimeLocalToIso("2026-08-22T10:00"),
      ends_at: datetimeLocalToIso("2026-08-22T11:00"),
      location: "Marina",
      notes: null,
      assigned_user_id: MEMBERS[0]!.user_id,
    });
  });

  it("defaults assignee to unassigned", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AppointmentForm members={MEMBERS} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Schedule appointment" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_user_id: null, ends_at: null })
    );
  });

  it("shows a client-side error when end is not after start", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AppointmentForm members={MEMBERS} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-08-22T10:00" },
    });
    fireEvent.change(screen.getByLabelText("End"), {
      target: { value: "2026-08-22T09:00" },
    });
    await user.click(screen.getByRole("button", { name: "Schedule appointment" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "End time must be after the start time."
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders as an edit form with initial values", () => {
    render(
      <AppointmentForm
        members={MEMBERS}
        submitLabel="Save changes"
        initialValues={{
          starts_at: "2026-08-22T10:00:00Z",
          location: "Showroom",
          assigned_user_id: MEMBERS[0]!.user_id,
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Edit appointment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Location")).toHaveValue("Showroom");
  });
});
