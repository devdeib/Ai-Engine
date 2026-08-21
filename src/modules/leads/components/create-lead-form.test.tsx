/**
 * Tests for the CreateLeadForm component.
 *
 * Tests cover:
 *   - Form fields are present and accessible
 *   - Required field validation (client-side)
 *   - organization_id is never included in the submitted payload
 *   - Successful submission calls onSuccess
 *   - Server validation (422) field errors are displayed
 *   - Server error messages are displayed
 *   - Submit button is disabled during submission (prevents duplicates)
 *   - Cancel calls onCancel
 *
 * NO LIVE API REQUIRED — global.fetch is mocked per test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateLeadForm } from "./create-lead-form";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";

function mockSuccessResponse() {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      data: {
        id: LEAD_ID,
        first_name: "Ahmed",
        last_name: "Ali",
        organization_id: ORG_A,
      },
    }),
  };
}

function mock422Response(details: Record<string, string[]>) {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details },
    }),
  };
}

function mock500Response() {
  return {
    ok: false,
    status: 500,
    json: async () => ({
      error: { code: "INTERNAL_ERROR", message: "Server error occurred" },
    }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Form rendering
// ---------------------------------------------------------------------------

describe("CreateLeadForm — rendering", () => {
  it("renders the form heading", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText("New Lead")).toBeInTheDocument();
  });

  it("renders required first and last name fields with indicators", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
  });

  it("renders optional fields: email, phone, company, score, notes", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/score/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("renders Source and Status select fields", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByLabelText(/source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toBeInTheDocument();
  });

  it("renders Create Lead submit button and Cancel button", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /create lead/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Client-side required field validation
// ---------------------------------------------------------------------------

describe("CreateLeadForm — required field validation", () => {
  it("shows first name error when submitting with empty first name", async () => {
    const user = userEvent.setup();
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    expect(await screen.findByText(/first name is required/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows last name error when submitting with empty last name", async () => {
    const user = userEvent.setup();
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    expect(await screen.findByText(/last name is required/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not submit when both name fields are empty", async () => {
    const user = userEvent.setup();
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /create lead/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe("CreateLeadForm — successful submission", () => {
  it("calls onSuccess after a successful API response", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={onSuccess} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("submits to the correct API endpoint using the organizationId", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);

    render(
      <CreateLeadForm
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [url] = vi.mocked(global.fetch).mock.calls[0] as [string];
    expect(url).toContain(`/api/v1/organizations/${ORG_A}/leads`);
  });

  it("never sends organization_id in the POST body", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("organization_id");
  });

  it("submits successfully with only required fields (no email)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);
    const onSuccess = vi.fn();

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={onSuccess} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());

    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("email");
  });
});

// ---------------------------------------------------------------------------
// Duplicate submission prevention
// ---------------------------------------------------------------------------

describe("CreateLeadForm — duplicate submission prevention", () => {
  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    // Never resolves — keeps the component in submitting state
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    // Button text changes to "Creating…" while pending
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled()
    );
  });
});

// ---------------------------------------------------------------------------
// Server validation errors
// ---------------------------------------------------------------------------

describe("CreateLeadForm — server validation errors", () => {
  it("displays field errors returned in the 422 response", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      mock422Response({ email: ["A valid email address is required"] }) as Response
    );

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    expect(
      await screen.findByText(/a valid email address is required/i)
    ).toBeInTheDocument();
  });

  it("displays a generic server error message on 500", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mock500Response() as Response);

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    expect(await screen.findByText(/server error occurred/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Owner selector (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_ID = "owner111-0000-0000-0000-000000000001";
const MEMBERS = [{ user_id: OWNER_ID, display_name: "Sarah Manager" }];

describe("CreateLeadForm — owner selector", () => {
  it("renders an Owner select field with 'Unassigned' as default", () => {
    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={vi.fn()} />
    );

    const ownerSelect = screen.getByRole("combobox", { name: /owner/i });
    expect(ownerSelect).toBeInTheDocument();
    expect((ownerSelect as HTMLSelectElement).value).toBe("");
  });

  it("shows member options when members prop is provided", () => {
    render(
      <CreateLeadForm
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    expect(screen.getByRole("option", { name: "Sarah Manager" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Unassigned" })).toBeInTheDocument();
  });

  it("does not include owner_id in the payload when 'Unassigned' is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);

    render(
      <CreateLeadForm
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("owner_id");
  });

  it("includes owner_id in the payload when a member is selected", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(mockSuccessResponse() as Response);

    render(
      <CreateLeadForm
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.selectOptions(screen.getByRole("combobox", { name: /owner/i }), OWNER_ID);
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.owner_id).toBe(OWNER_ID);
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe("CreateLeadForm — cancel", () => {
  it("calls onCancel when the Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={onCancel} />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onCancel when the X close button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <CreateLeadForm organizationId={ORG_A} onSuccess={vi.fn()} onCancel={onCancel} />
    );

    await user.click(screen.getByRole("button", { name: /close form/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
