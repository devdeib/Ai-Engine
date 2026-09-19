/**
 * Tests for the LeadTable component.
 *
 * Tests cover:
 *   - Loading state renders skeleton
 *   - Error state renders error UI and retry button
 *   - Empty state renders empty UI and new-lead button
 *   - Populated state renders lead rows
 *   - Nullable fields (email, phone, company, score) render safely
 *   - Status badge displays correct label
 *   - Retry and new-lead callbacks are invoked correctly
 *   - Name cell links to the lead detail page
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock next/link so it renders as a plain <a> in jsdom without a router context
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
import { LeadTable } from "./lead-table";
import type { Lead } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organization_id: "aaaaaaaa-0000-0000-0000-000000000001",
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

const noop = () => undefined;

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("LeadTable — loading state", () => {
  it("renders the skeleton table when isLoading is true", () => {
    const { container } = render(
      <LeadTable
        leads={[]}
        isLoading={true}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    // Skeleton rows are present (animate-pulse divs)
    const pulseEls = container.querySelectorAll(".animate-pulse");
    expect(pulseEls.length).toBeGreaterThan(0);
  });

  it("does not show lead data or empty state while loading", () => {
    render(
      <LeadTable
        leads={[]}
        isLoading={true}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.queryByText("No leads yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to load leads")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe("LeadTable — error state", () => {
  it("shows the error message when an error is provided", () => {
    render(
      <LeadTable
        leads={[]}
        isLoading={false}
        error="Network error"
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("Failed to load leads")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <LeadTable
        leads={[]}
        isLoading={false}
        error="error"
        onRetry={onRetry}
        onNewLead={noop}
      />
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("LeadTable — empty state", () => {
  it("shows empty state when leads array is empty", () => {
    render(
      <LeadTable
        leads={[]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("No leads yet")).toBeInTheDocument();
    expect(
      screen.getByText(/create your first lead/i)
    ).toBeInTheDocument();
  });

  it("calls onNewLead when the New Lead button in the empty state is clicked", async () => {
    const user = userEvent.setup();
    const onNewLead = vi.fn();

    render(
      <LeadTable
        leads={[]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={onNewLead}
      />
    );

    await user.click(screen.getByRole("button", { name: /new lead/i }));
    expect(onNewLead).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Populated state
// ---------------------------------------------------------------------------

describe("LeadTable — populated state", () => {
  it("renders a row for each lead", () => {
    const leads = [
      makeLead({ id: "11111111-1111-4111-8111-111111111111", first_name: "Ahmed", last_name: "Ali" }),
      makeLead({ id: "22222222-2222-4222-8222-222222222222", first_name: "Sara", last_name: "Ahmed" }),
    ];

    render(
      <LeadTable
        leads={leads}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );

    expect(screen.getByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText("Sara Ahmed")).toBeInTheDocument();
  });

  it("shows table column headers", () => {
    render(
      <LeadTable
        leads={[makeLead()]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.getByText("Qualification")).toBeInTheDocument();
    expect(screen.getByText("Interest")).toBeInTheDocument();
  });

  it("displays the qualification badge with the correct label", () => {
    const lead = makeLead({
      email: "ahmed@example.com",
      qualification_facts: {
        budget: "AED 1.5M",
        timeline: "3 months",
        location: "Dubai Marina",
      },
    });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("Qualified")).toBeInTheDocument();
  });

  it("displays the email when present", () => {
    const lead = makeLead({ email: "ahmed@example.com" });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("ahmed@example.com")).toBeInTheDocument();
  });

  it("name cell is a link to the lead detail page", () => {
    const lead = makeLead({ id: "11111111-1111-4111-8111-111111111111" });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    const link = screen.getByRole("link", { name: "Ahmed Ali" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/leads/11111111-1111-4111-8111-111111111111"
    );
  });
});

// ---------------------------------------------------------------------------
// Nullable field handling
// ---------------------------------------------------------------------------

describe("LeadTable — nullable field safety", () => {
  it("renders safely when email is null", () => {
    const lead = makeLead({ email: null });
    expect(() =>
      render(
        <LeadTable
          leads={[lead]}
          isLoading={false}
          error={null}
          onRetry={noop}
          onNewLead={noop}
        />
      )
    ).not.toThrow();
  });

  it("renders safely when phone is null", () => {
    const lead = makeLead({ phone: null });
    expect(() =>
      render(
        <LeadTable
          leads={[lead]}
          isLoading={false}
          error={null}
          onRetry={noop}
          onNewLead={noop}
        />
      )
    ).not.toThrow();
  });

  it("renders safely when company_name is null", () => {
    const lead = makeLead({ company_name: null });
    expect(() =>
      render(
        <LeadTable
          leads={[lead]}
          isLoading={false}
          error={null}
          onRetry={noop}
          onNewLead={noop}
        />
      )
    ).not.toThrow();
  });

  it("shows Not started when qualification has not begun", () => {
    const lead = makeLead({ score: null, qualification_facts: {} });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("shows captured budget when qualification facts exist", () => {
    const lead = makeLead({
      email: "ahmed@example.com",
      qualification_facts: {
        budget: "AED 1.5M",
        timeline: "3 months",
        location: "Dubai Marina",
      },
    });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("AED 1.5M")).toBeInTheDocument();
    expect(screen.getByText("3 months")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Qualification facts
// ---------------------------------------------------------------------------

describe("LeadTable — qualification facts", () => {
  it("shows interest from property type and location", () => {
    const lead = makeLead({
      qualification_facts: {
        property_type: "2BR Apartment",
        location: "Dubai Marina",
      },
    });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getByText("2BR Apartment · Dubai Marina")).toBeInTheDocument();
  });

  it("renders placeholder dashes when facts are empty", () => {
    const lead = makeLead({ qualification_facts: {} });
    render(
      <LeadTable
        leads={[lead]}
        isLoading={false}
        error={null}
        onRetry={noop}
        onNewLead={noop}
      />
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
