import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { FollowUpList } from "./follow-up-list";
import type { LeadFollowUp } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const FU_1 = "ffffffff-0000-4000-8000-000000000001";
const MEMBER = {
  user_id: "00000000-0000-4000-8000-000000000001",
  display_name: "Sara Khan",
};

function makeFollowUp(overrides: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id: FU_1,
    organization_id: ORG_A,
    lead_id: LEAD_ID,
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

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("FollowUpList", () => {
  it("shows a loading skeleton while fetching", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows an empty state when there are no follow-ups", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ data: [], meta: { count: 0 } }) as Response
    );
    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(await screen.findByText("No follow-ups yet.")).toBeInTheDocument();
  });

  it("renders follow-ups after a successful fetch", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ data: [makeFollowUp()], meta: { count: 1 } }) as Response
    );
    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(
      await screen.findByText("Call Ahmed about the property")
    ).toBeInTheDocument();
    expect(screen.getByText("Discuss the two-bedroom option")).toBeInTheDocument();
  });

  it("shows a fetch error with retry", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, 500) as Response)
      .mockResolvedValueOnce(
        jsonResponse({ data: [makeFollowUp()], meta: { count: 1 } }) as Response
      );

    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );

    expect(await screen.findByText("Failed to load follow-ups.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByText("Call Ahmed about the property")
    ).toBeInTheDocument();
  });

  it("creates a follow-up and refreshes the list", async () => {
    const user = userEvent.setup();
    const created = makeFollowUp({ title: "Site visit" });
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url.includes("/follow-ups")) {
        return jsonResponse({ data: created }, 201) as Response;
      }
      if (url.includes("/follow-ups")) {
        const calledPost = vi.mocked(global.fetch).mock.calls.some(
          ([, requestInit]) => requestInit?.method === "POST"
        );
        return jsonResponse({
          data: calledPost ? [created] : [],
          meta: { count: calledPost ? 1 : 0 },
        }) as Response;
      }
      return jsonResponse({ error: { message: "unexpected" } }, 500) as Response;
    });

    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );

    expect(await screen.findByText("No follow-ups yet.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "Site visit");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));

    await waitFor(() => {
      expect(screen.getByText("Site visit")).toBeInTheDocument();
    });
  });

  it("shows a create error without leaving the form", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        return jsonResponse({ error: { message: "Validation failed" } }, 422) as Response;
      }
      return jsonResponse({ data: [], meta: { count: 0 } }) as Response;
    });

    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    await screen.findByText("No follow-ups yet.");

    await user.type(screen.getByLabelText("Title"), "Site visit");
    fireEvent.change(screen.getByLabelText("Due date"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.click(screen.getByRole("button", { name: "Add follow-up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Validation failed");
    expect(screen.getByLabelText("Title")).toHaveValue("Site visit");
  });

  it("completes a pending follow-up and refreshes", async () => {
    const user = userEvent.setup();
    let status: LeadFollowUp["status"] = "pending";
    vi.mocked(global.fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        status = "completed";
        return jsonResponse({ data: makeFollowUp({ status }) }) as Response;
      }
      return jsonResponse({
        data: [makeFollowUp({ status })],
        meta: { count: 1 },
      }) as Response;
    });

    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    await screen.findByText("Call Ahmed about the property");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("cancels a pending follow-up and refreshes", async () => {
    const user = userEvent.setup();
    let status: LeadFollowUp["status"] = "pending";
    vi.mocked(global.fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        status = "cancelled";
        return jsonResponse({ data: makeFollowUp({ status }) }) as Response;
      }
      return jsonResponse({
        data: [makeFollowUp({ status })],
        meta: { count: 1 },
      }) as Response;
    });

    render(
      <FollowUpList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    await screen.findByText("Call Ahmed about the property");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
  });
});
