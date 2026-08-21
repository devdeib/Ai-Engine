import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { FollowUpsQueueClient } from "./follow-ups-queue-client";
import type { LeadFollowUpWithLead } from "@/lib/db/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";

function makeFollowUp(
  overrides: Partial<LeadFollowUpWithLead> = {}
): LeadFollowUpWithLead {
  return {
    id: "ffffffff-0000-4000-8000-000000000001",
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    title: "Call Ahmed about the property",
    notes: null,
    due_at: "2099-08-22T10:00:00Z",
    status: "pending",
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    lead: {
      id: LEAD_ID,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: null,
    },
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation(async (input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/members")) {
      return jsonResponse({ data: [], meta: { count: 0 } }) as Response;
    }
    return jsonResponse({ data: [], meta: { page: 1, limit: 20, count: 0 } }) as Response;
  });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("FollowUpsQueueClient", () => {
  it("shows a loading skeleton", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <FollowUpsQueueClient organizationId={ORG_A} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    render(<FollowUpsQueueClient organizationId={ORG_A} />);
    expect(await screen.findByText("No follow-ups")).toBeInTheDocument();
  });

  it("renders overdue, due-today grouping labels, and lead link", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/members")) {
        return jsonResponse({ data: [], meta: { count: 0 } }) as Response;
      }
      return jsonResponse({
        data: [
          makeFollowUp({
            id: "1",
            title: "Past due call",
            due_at: "2020-01-01T10:00:00Z",
          }),
          makeFollowUp({
            id: "2",
            title: "Future visit",
            due_at: "2099-08-22T10:00:00Z",
          }),
        ],
        meta: { page: 1, limit: 20, count: 2 },
      }) as Response;
    });

    render(<FollowUpsQueueClient organizationId={ORG_A} />);

    expect(await screen.findByText("Past due call")).toBeInTheDocument();
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(0);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Future visit")).toBeInTheDocument();
    expect(screen.getAllByText("Ahmed Ali").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Ahmed Ali" })[0]).toHaveAttribute(
      "href",
      `/dashboard/leads/${LEAD_ID}`
    );
  });

  it("shows a fetch error with retry", async () => {
    const user = userEvent.setup();
    let listAttempts = 0;
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/members")) {
        return jsonResponse({ data: [] }) as Response;
      }
      listAttempts += 1;
      if (listAttempts === 1) {
        return jsonResponse({ error: { message: "boom" } }, 500) as Response;
      }
      return jsonResponse({
        data: [makeFollowUp()],
        meta: { page: 1, limit: 20, count: 1 },
      }) as Response;
    });

    render(<FollowUpsQueueClient organizationId={ORG_A} />);
    expect(
      await screen.findByText("Unable to load follow-ups. Please try again.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(
      await screen.findByText("Call Ahmed about the property")
    ).toBeInTheDocument();
  });

  it("filters by completed tab", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/members")) {
        return jsonResponse({ data: [] }) as Response;
      }
      if (url.includes("status=completed")) {
        return jsonResponse({
          data: [makeFollowUp({ status: "completed", title: "Done call" })],
          meta: { page: 1, limit: 20, count: 1 },
        }) as Response;
      }
      return jsonResponse({
        data: [makeFollowUp()],
        meta: { page: 1, limit: 20, count: 1 },
      }) as Response;
    });

    render(<FollowUpsQueueClient organizationId={ORG_A} />);
    expect(await screen.findByText("Call Ahmed about the property")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Completed" }));
    expect(await screen.findByText("Done call")).toBeInTheDocument();
  });

  it("completes a follow-up from the queue", async () => {
    const user = userEvent.setup();
    let status: LeadFollowUpWithLead["status"] = "pending";
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/members")) {
        return jsonResponse({ data: [] }) as Response;
      }
      if (method === "PATCH") {
        status = "completed";
        return jsonResponse({ data: makeFollowUp({ status }) }) as Response;
      }
      return jsonResponse({
        data: [makeFollowUp({ status })],
        meta: { page: 1, limit: 20, count: 1 },
      }) as Response;
    });

    render(<FollowUpsQueueClient organizationId={ORG_A} />);
    await screen.findByText("Call Ahmed about the property");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });
});
