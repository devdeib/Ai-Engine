/**
 * Tests for the EditLeadForm component.
 *
 * Tests cover:
 *   - Form is pre-populated with existing lead values
 *   - Submit button reads "Save Changes"
 *   - Sends PATCH to the correct URL
 *   - organization_id is never included in the PATCH body
 *   - Cleared optional fields are sent as null (not omitted)
 *   - Calls onSuccess after a successful update
 *   - Displays server validation errors (422)
 *   - Displays generic server errors
 *   - Submit disabled during submission (prevents duplicates)
 *   - Cancel calls onCancel
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditLeadForm } from "./edit-lead-form";
import type { Lead } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: LEAD_ID,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: "ahmed@example.com",
    phone: "+974 55 123 456",
    company_name: "Acme Corp",
    source: "website",
    status: "qualified",
    score: 80,
    notes: "Key contact at HQ",
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

function makeSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: makeLead() }),
  };
}

function make422Response(details: Record<string, string[]>) {
  return {
    ok: false,
    status: 422,
    json: async () => ({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details },
    }),
  };
}

function make500Response() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "Internal server error" } }),
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
// Pre-population
// ---------------------------------------------------------------------------

describe("EditLeadForm — pre-population", () => {
  it("pre-populates the first name field from the lead", () => {
    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/first name/i)).toHaveValue("Ahmed");
  });

  it("pre-populates the last name field from the lead", () => {
    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/last name/i)).toHaveValue("Ali");
  });

  it("pre-populates the email field when email is present", () => {
    render(
      <EditLeadForm
        lead={makeLead({ email: "ahmed@example.com" })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/email/i)).toHaveValue("ahmed@example.com");
  });

  it("shows an empty email field when lead email is null", () => {
    render(
      <EditLeadForm
        lead={makeLead({ email: null })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/email/i)).toHaveValue("");
  });

  it("pre-populates the score field when score is a number", () => {
    render(
      <EditLeadForm
        lead={makeLead({ score: 80 })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/score/i)).toHaveValue(80);
  });

  it("shows an empty score field when lead score is null", () => {
    render(
      <EditLeadForm
        lead={makeLead({ score: null })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/score/i)).toHaveValue(null);
  });

  it("renders the Save Changes button", () => {
    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /save changes/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe("EditLeadForm — successful submission", () => {
  it("calls onSuccess after a successful PATCH response", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("sends a PATCH request to the correct lead URL", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(global.fetch).mock
      .calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/api/v1/organizations/${ORG_A}/leads/${LEAD_ID}`
    );
    expect(init.method).toBe("PATCH");
  });

  it("never sends organization_id in the PATCH body", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("organization_id");
  });

  it("sends null for a cleared email field", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead({ email: "ahmed@example.com" })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText(/email/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.email).toBeNull();
  });

  it("sends null for a cleared score field", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead({ score: 75 })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText(/score/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, init] = vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Duplicate submission prevention
// ---------------------------------------------------------------------------

describe("EditLeadForm — duplicate submission prevention", () => {
  it("disables the save button while the request is in flight", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled()
    );
  });
});

// ---------------------------------------------------------------------------
// Server errors
// ---------------------------------------------------------------------------

describe("EditLeadForm — server errors", () => {
  it("displays field errors from a 422 response", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      make422Response({ email: ["A valid email address is required"] }) as Response
    );

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/a valid email address is required/i)
    ).toBeInTheDocument();
  });

  it("displays a generic error message on 500", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(make500Response() as Response);

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/internal server error/i)
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Required field validation
// ---------------------------------------------------------------------------

describe("EditLeadForm — required field validation", () => {
  it("shows first name error when the field is cleared before submitting", async () => {
    const user = userEvent.setup();

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText(/first name/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(/first name is required/i)
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe("EditLeadForm — cancel", () => {
  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Owner selector (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_ID = "owner111-0000-0000-0000-000000000001";
const MEMBERS = [{ user_id: OWNER_ID, display_name: "Sarah Manager" }];

describe("EditLeadForm — owner selector", () => {
  it("renders an Owner select field", () => {
    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("combobox", { name: /owner/i })).toBeInTheDocument();
  });

  it("pre-selects the current owner_id from the lead", () => {
    render(
      <EditLeadForm
        lead={makeLead({ owner_id: OWNER_ID })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    const ownerSelect = screen.getByRole("combobox", { name: /owner/i }) as HTMLSelectElement;
    expect(ownerSelect.value).toBe(OWNER_ID);
  });

  it("shows 'Unassigned' as the default when owner_id is null", () => {
    render(
      <EditLeadForm
        lead={makeLead({ owner_id: null })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    const ownerSelect = screen.getByRole("combobox", { name: /owner/i }) as HTMLSelectElement;
    expect(ownerSelect.value).toBe("");
  });

  it("sends null when owner is cleared (set to Unassigned)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead({ owner_id: OWNER_ID })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /owner/i }), "");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.owner_id).toBeNull();
  });

  it("sends the selected owner_id UUID when a member is chosen", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeSuccessResponse() as Response);

    render(
      <EditLeadForm
        lead={makeLead({ owner_id: null })}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
        members={MEMBERS}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /owner/i }), OWNER_ID);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body.owner_id).toBe(OWNER_ID);
  });
});

describe("EditLeadForm — qualification fields stay off this form", () => {
  it("does not render qualification fact inputs", () => {
    render(
      <EditLeadForm
        lead={makeLead()}
        organizationId={ORG_A}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Budget")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Timeline")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Property type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Financing")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Decision maker")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save qualification/i })
    ).not.toBeInTheDocument();
  });
});
