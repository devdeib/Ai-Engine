import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import {
  CreateFollowUpForm,
  datetimeLocalToIso,
} from "./create-follow-up-form";

const MEMBERS = [
  { user_id: "00000000-0000-4000-8000-000000000001", display_name: "Sara Khan" },
];

describe("datetimeLocalToIso", () => {
  it("returns null for an empty value", () => {
    expect(datetimeLocalToIso("")).toBeNull();
  });

  it("returns an ISO timestamp for a datetime-local value", () => {
    const iso = datetimeLocalToIso("2026-08-22T10:00");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("CreateFollowUpForm", () => {
  it("renders title, due date, assignee, and notes fields", () => {
    render(<CreateFollowUpForm members={MEMBERS} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Due date")).toBeInTheDocument();
    expect(screen.getByLabelText("Assigned to")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sara Khan" })).toBeInTheDocument();
  });

  it("disables submit until title and due date are set", () => {
    render(<CreateFollowUpForm members={MEMBERS} onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add follow-up" })).toBeDisabled();
  });

  it("submits ISO due_at and selected member", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<CreateFollowUpForm members={MEMBERS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "Call Ahmed");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.selectOptions(screen.getByLabelText("Assigned to"), MEMBERS[0]!.user_id);
    await user.type(screen.getByLabelText("Notes"), "Discuss pricing");
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Call Ahmed",
      notes: "Discuss pricing",
      due_at: datetimeLocalToIso("2026-08-22T10:00"),
      assigned_user_id: MEMBERS[0]!.user_id,
    });
  });

  it("submits null assignee when Unassigned is selected", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<CreateFollowUpForm members={MEMBERS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "Call Ahmed");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_user_id: null, notes: null })
    );
  });

  it("shows a parent error", () => {
    render(
      <CreateFollowUpForm
        members={MEMBERS}
        error="Failed to create follow-up."
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to create follow-up."
    );
  });

  it("keeps values when onSubmit throws", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("nope"));

    render(<CreateFollowUpForm members={MEMBERS} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "Call Ahmed");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));

    expect(screen.getByLabelText("Title")).toHaveValue("Call Ahmed");
  });
});
