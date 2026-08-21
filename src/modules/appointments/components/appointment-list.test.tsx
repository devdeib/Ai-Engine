import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { AppointmentList } from "./appointment-list";
import type { Appointment } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const APPT_1 = "aaaaaaaa-0000-4000-8000-0000000000aa";
const MEMBER = {
  user_id: "00000000-0000-4000-8000-000000000001",
  display_name: "Sara Khan",
};

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: APPT_1,
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    assigned_user_id: null,
    starts_at: "2099-08-22T10:00:00Z",
    ends_at: null,
    status: "scheduled",
    location: "West Bay",
    notes: null,
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

describe("AppointmentList", () => {
  it("shows a loading skeleton", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ data: [], meta: { count: 0 } }) as Response
    );
    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(await screen.findByText("No appointments yet.")).toBeInTheDocument();
  });

  it("renders appointments after fetch", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ data: [makeAppointment()], meta: { count: 1 } }) as Response
    );
    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(await screen.findByText("West Bay")).toBeInTheDocument();
  });

  it("shows a fetch error with retry", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ error: { message: "boom" } }, 500) as Response)
      .mockResolvedValueOnce(
        jsonResponse({ data: [makeAppointment()], meta: { count: 1 } }) as Response
      );
    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(await screen.findByText("Failed to load appointments.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByText("West Bay")).toBeInTheDocument();
  });

  it("creates an appointment and refreshes", async () => {
    const user = userEvent.setup();
    const created = makeAppointment({ location: "Marina" });
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url.includes("/appointments")) {
        return jsonResponse({ data: created }, 201) as Response;
      }
      const calledPost = vi
        .mocked(global.fetch)
        .mock.calls.some(([, requestInit]) => requestInit?.method === "POST");
      return jsonResponse({
        data: calledPost ? [created] : [],
        meta: { count: calledPost ? 1 : 0 },
      }) as Response;
    });

    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    expect(await screen.findByText("No appointments yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Start"), {
      target: { value: "2026-08-22T10:00" },
    });
    await user.type(screen.getByLabelText("Location"), "Marina");
    await user.click(screen.getByRole("button", { name: "Schedule appointment" }));
    await waitFor(() => {
      expect(screen.getByText("Marina")).toBeInTheDocument();
    });
  });

  it("completes a scheduled appointment", async () => {
    const user = userEvent.setup();
    let status: Appointment["status"] = "scheduled";
    vi.mocked(global.fetch).mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      if (method === "PATCH") {
        status = "completed";
        return jsonResponse({ data: makeAppointment({ status }) }) as Response;
      }
      return jsonResponse({
        data: [makeAppointment({ status })],
        meta: { count: 1 },
      }) as Response;
    });
    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    await screen.findByText("West Bay");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("opens the edit form for a scheduled appointment", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({ data: [makeAppointment()], meta: { count: 1 } }) as Response
    );
    render(
      <AppointmentList organizationId={ORG_A} leadId={LEAD_ID} members={[MEMBER]} />
    );
    await screen.findByText("West Bay");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Edit appointment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});
