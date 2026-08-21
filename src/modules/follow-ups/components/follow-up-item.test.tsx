import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FollowUpItem } from "./follow-up-item";
import type { LeadFollowUp } from "@/lib/db/types";

const NOW = new Date("2026-08-20T12:00:00Z");

function makeFollowUp(overrides: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id: "ffffffff-0000-4000-8000-000000000001",
    organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
    lead_id: "11111111-1111-4111-8111-111111111111",
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: "Discuss the two-bedroom option",
    due_at: "2026-08-22T10:00:00Z",
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

describe("FollowUpItem", () => {
  it("renders title, due date, notes, and unassigned state", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp()}
        assigneeName={null}
        now={NOW}
      />
    );

    expect(screen.getByText("Call Ahmed about the property")).toBeInTheDocument();
    expect(screen.getByText("Discuss the two-bedroom option")).toBeInTheDocument();
    expect(screen.getByText(/Unassigned/)).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-08-22T10:00:00Z"
    );
  });

  it("renders the assignee name when provided", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp({ assigned_user_id: "user-1" })}
        assigneeName="Sara Khan"
        now={NOW}
      />
    );
    expect(screen.getByText(/Sara Khan/)).toBeInTheDocument();
  });

  it("shows an Overdue label for pending items past due", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp({ due_at: "2026-08-19T10:00:00Z" })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("does not show Overdue for completed items", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp({
          status: "completed",
          due_at: "2026-08-19T10:00:00Z",
        })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.queryByText("Overdue")).not.toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("shows cancelled state without actions", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp({ status: "cancelled" })}
        assigneeName={null}
        now={NOW}
      />
    );
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  });

  it("calls onComplete and onCancel for pending items", async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onCancel = vi.fn();
    render(
      <FollowUpItem
        followUp={makeFollowUp()}
        assigneeName={null}
        now={NOW}
        onComplete={onComplete}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onComplete).toHaveBeenCalledWith(
      "ffffffff-0000-4000-8000-000000000001"
    );
    expect(onCancel).toHaveBeenCalledWith(
      "ffffffff-0000-4000-8000-000000000001"
    );
  });

  it("renders an action error", () => {
    render(
      <FollowUpItem
        followUp={makeFollowUp()}
        assigneeName={null}
        now={NOW}
        error="Failed to update follow-up."
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to update follow-up."
    );
  });
});
