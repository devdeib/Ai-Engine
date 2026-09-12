/**
 * Tests for the LeadDetailClient component.
 *
 * Tests cover:
 *   - Loading skeleton shown on initial fetch
 *   - Lead details rendered after successful fetch
 *   - Error state shown on failed fetch
 *   - "Lead not found" state shown on 404
 *   - Edit button opens the edit form
 *   - Save from edit form refreshes the lead and returns to view
 *   - Cancel in edit mode returns to view
 *   - Delete button shows the confirmation banner
 *   - Cancel in delete mode returns to view
 *   - Confirming delete calls DELETE API and redirects to /dashboard/leads
 *   - Delete error is displayed without leaving the page
 *   - Nullable fields (email, phone, company, score) render safely
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { LeadDetailClient } from "./lead-detail-client";
import type { Lead } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Stub the ActivityTimeline so its own fetch calls do not interfere with the
// LeadDetailClient test fetch mocks (ActivityTimeline is tested separately).
vi.mock(
  "@/modules/leads/activities/components/activity-timeline",
  () => ({ ActivityTimeline: () => null })
);

vi.mock(
  "@/modules/conversations/components/lead-conversation-card",
  () => ({ LeadConversationCard: () => <div>Conversation section</div> })
);

vi.mock("@/modules/follow-ups/components/follow-up-list", () => ({
  FollowUpList: () => <div>Follow-ups section</div>,
}));

vi.mock("@/modules/appointments/components/appointment-list", () => ({
  AppointmentList: () => <div>Appointments section</div>,
}));

vi.mock("@/modules/ai/components/pending-ai-actions-panel", () => ({
  PendingAiActionsPanel: () => null,
}));

vi.mock("@/modules/ai/components/ai-operator-insight-panel", () => ({
  AiOperatorInsightPanel: () => null,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    asChild: _asChild,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    asChild?: boolean;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

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
    status: "new",
    score: 75,
    notes: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

function makeLeadResponse(lead: Lead) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: lead }),
  };
}

function make404Response() {
  return {
    ok: false,
    status: 404,
    json: async () => ({ error: { message: "Not found" } }),
  };
}

function make500Response() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "Internal error" } }),
  };
}

function makePatchSuccessResponse(lead: Lead) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: lead }),
  };
}

function makeDeleteSuccessResponse() {
  return { ok: true, status: 204, json: async () => ({}) };
}

// Empty members response — satisfies the members fetch that LeadDetailClient makes on
// mount without interfering with other response assertions.
function makeEmptyMembersResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: { count: 0 } }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = vi.fn();
  mockPush.mockClear();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("LeadDetailClient — loading state", () => {
  it("shows the loading skeleton while fetching", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));

    const { container } = render(
      <LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />
    );

    const skeletonEls = container.querySelectorAll(".animate-pulse");
    expect(skeletonEls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Data rendering
// ---------------------------------------------------------------------------

describe("LeadDetailClient — data rendering", () => {
  it("renders the lead name as the page heading after fetch", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(await screen.findByRole("heading", { name: "Ahmed Ali" })).toBeInTheDocument();
  });

  it("renders the status label for the current status", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead({ status: "qualified" })) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    // "Qualified" appears both in the header badge and the detail card
    const instances = await screen.findAllByText("Qualified");
    expect(instances.length).toBeGreaterThan(0);
  });

  it("renders the contact email", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead({ email: "ahmed@example.com" })) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(await screen.findByText("ahmed@example.com")).toBeInTheDocument();
  });

  it("renders derived qualification status and collected facts as read-only", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(
        makeLead({
          qualification_facts: {
            budget: "200k",
            timeline: "3 months",
            location: "Limassol",
          },
        })
      ) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(await screen.findByText("Qualification")).toBeInTheDocument();
    expect(screen.getAllByText("Qualified").length).toBeGreaterThan(0);
    expect(screen.getByText("200k")).toBeInTheDocument();
    expect(screen.getByText("3 months")).toBeInTheDocument();
    expect(screen.getByText("Limassol")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save qualification/i })
    ).not.toBeInTheDocument();
  });

  it("renders safely when email is null", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead({ email: null })) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    // Should not throw; the heading still appears
    expect(await screen.findByRole("heading", { name: "Ahmed Ali" })).toBeInTheDocument();
  });

  it("renders 'Not scored' when score is null", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead({ score: null })) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByRole("heading", { name: "Ahmed Ali" });
    expect(screen.getByText("Not scored")).toBeInTheDocument();
  });

  it("shows Edit and Delete buttons in view mode", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByText("Conversation section")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

describe("LeadDetailClient — error states", () => {
  it("shows 'Failed to load lead' on a non-404 error", async () => {
    vi.mocked(global.fetch).mockResolvedValue(make500Response() as Response);

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(await screen.findByText("Failed to load lead")).toBeInTheDocument();
  });

  it("shows 'Lead not found' on a 404 response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(make404Response() as Response);

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(await screen.findByText("Lead not found")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Edit mode
// ---------------------------------------------------------------------------

describe("LeadDetailClient — edit mode", () => {
  it("opens the edit form when Edit is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("returns to view mode when Cancel is clicked in edit form", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Edit form is gone; view mode buttons are back
    expect(
      screen.queryByRole("button", { name: /save changes/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("refreshes the lead and returns to view after successful save", async () => {
    const user = userEvent.setup();
    const updatedLead = makeLead({ first_name: "Ali", last_name: "Ahmed" });

    // Call order: (1) lead GET, (2) members fetch, (3) PATCH, (4) lead re-fetch
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeLeadResponse(makeLead()) as Response)         // initial GET
      .mockResolvedValueOnce(makeEmptyMembersResponse() as Response)           // members
      .mockResolvedValueOnce(makePatchSuccessResponse(updatedLead) as Response) // PATCH
      .mockResolvedValueOnce(makeLeadResponse(updatedLead) as Response);        // re-fetch

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    // After save: view mode restored with updated name
    expect(await screen.findByRole("heading", { name: "Ali Ahmed" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save changes/i })
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delete mode
// ---------------------------------------------------------------------------

describe("LeadDetailClient — delete mode", () => {
  it("shows the delete confirmation when Delete is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /delete/i }));

    expect(
      screen.getByRole("alertdialog", { name: /delete lead confirmation/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete lead/i })
    ).toBeInTheDocument();
  });

  it("returns to view mode when Cancel is clicked in the confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead()) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      screen.queryByRole("alertdialog")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
  });

  it("calls router.push to /dashboard/leads after successful deletion", async () => {
    const user = userEvent.setup();

    // Call order: (1) lead GET, (2) members fetch, (3) DELETE
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeLeadResponse(makeLead()) as Response)  // GET
      .mockResolvedValueOnce(makeEmptyMembersResponse() as Response)    // members
      .mockResolvedValueOnce(makeDeleteSuccessResponse() as Response);  // DELETE

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /delete lead/i }));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/dashboard/leads")
    );
  });

  it("shows a delete error without navigating when the DELETE request fails", async () => {
    const user = userEvent.setup();

    // Call order: (1) lead GET, (2) members fetch, (3) DELETE (500)
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeLeadResponse(makeLead()) as Response)
      .mockResolvedValueOnce(makeEmptyMembersResponse() as Response)  // members
      .mockResolvedValueOnce(make500Response() as Response);

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /delete lead/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Owner display (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_ID = "owner111-0000-0000-0000-000000000001";

function makeMembersResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          user_id: OWNER_ID,
          role: "agent",
          profile: { display_name: "Sarah Manager", avatar_url: null },
        },
      ],
      meta: { count: 1 },
    }),
  };
}

describe("LeadDetailClient — owner display", () => {
  it("shows 'Unassigned' when the lead has no owner", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadResponse(makeLead({ owner_id: null })) as Response
    );

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("shows the owner display name when the lead has an owner and members are loaded", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeLeadResponse(makeLead({ owner_id: OWNER_ID })) as Response) // lead
      .mockResolvedValueOnce(makeMembersResponse() as Response); // members

    render(<LeadDetailClient organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByRole("heading", { name: "Ahmed Ali" });

    expect(await screen.findByText("Sarah Manager")).toBeInTheDocument();
  });
});
