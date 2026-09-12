/**
 * Tests for the LeadsClient component.
 *
 * Tests cover:
 *   - Fetches leads from the API and renders them
 *   - Renders empty state when no leads are returned
 *   - Renders error state when the API call fails
 *   - Filter bar renders search input, status select, source select, sort select
 *   - Changing status/source filter calls router.replace with updated URL
 *   - Search input debounces before updating URL
 *   - Pagination controls call router.replace with updated page param
 *   - Create form opens and refreshes list after successful creation
 *   - URL-derived filter params are included in API fetch request
 *
 * NO LIVE API REQUIRED — global.fetch and next/navigation are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { LeadsClient } from "./leads-client";
import type { Lead } from "@/lib/db/types";

// next/link renders as a plain <a> in jsdom
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

// next/navigation — mock useSearchParams, useRouter, usePathname
vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams() as unknown),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  usePathname: vi.fn(() => "/dashboard/leads"),
}));

import { useSearchParams, useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Helper — cast URLSearchParams to ReadonlyURLSearchParams (mock context)
// ---------------------------------------------------------------------------

function mockParams(
  init?: string | Record<string, string>
): ReturnType<typeof useSearchParams> {
  return new URLSearchParams(
    init
  ) as unknown as ReturnType<typeof useSearchParams>;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID_1 = "11111111-1111-4111-8111-111111111111";
const LEAD_ID_2 = "22222222-2222-4222-8222-222222222222";

function makeLead(id: string, overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: null,
    company_name: null,
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
    ...overrides,
  };
}

function makeLeadsResponse(leads: Lead[], page = 1, limit = 20) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: leads,
      meta: { page, limit, count: leads.length },
    }),
  };
}

function makeEmptyLeadsResponse() {
  return makeLeadsResponse([]);
}

function makeErrorResponse() {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message: "Internal error" } }),
  };
}

function makeCreateLeadResponse() {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      data: makeLead(LEAD_ID_1),
    }),
  };
}

// Empty members response — used to satisfy the members fetch that LeadsClient
// makes on mount without affecting other assertions.
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
  // Reset mocks to default (empty search params, no-op router)
  vi.mocked(useSearchParams).mockReturnValue(mockParams());
  vi.mocked(useRouter).mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
  } as unknown as ReturnType<typeof useRouter>);
});

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

describe("LeadsClient — data fetching", () => {
  it("shows lead rows after a successful fetch", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse([
        makeLead(LEAD_ID_1, { first_name: "Ahmed", last_name: "Ali" }),
        makeLead(LEAD_ID_2, { first_name: "Sara", last_name: "Ahmed" }),
      ]) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);

    expect(await screen.findByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText("Sara Ahmed")).toBeInTheDocument();
  });

  it("fetches the correct API endpoint with page 1 and limit 20 by default", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    // call[0] = members fetch, call[1] = leads fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(global.fetch).mock.calls[1] as [string];
    expect(url).toContain(`/api/v1/organizations/${ORG_A}/leads`);
    expect(url).toContain("page=1");
    expect(url).toContain("limit=20");
  });

  it("shows the empty state when no leads are returned", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    expect(await screen.findByText("No leads yet")).toBeInTheDocument();
  });

  it("shows the error state when the API call fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeErrorResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    expect(await screen.findByText("Failed to load leads")).toBeInTheDocument();
  });

  it("shows the error state when fetch throws a network error", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    render(<LeadsClient organizationId={ORG_A} />);

    expect(await screen.findByText("Failed to load leads")).toBeInTheDocument();
  });

  it("includes search param in the API request when URL has ?search=", async () => {
    vi.mocked(useSearchParams).mockReturnValue(mockParams("search=ahmed"));
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    // call[0] = members fetch, call[1] = leads fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(global.fetch).mock.calls[1] as [string];
    expect(url).toContain("search=ahmed");
  });

  it("includes status param in the API request when URL has ?status=", async () => {
    vi.mocked(useSearchParams).mockReturnValue(mockParams("status=qualified"));
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    // call[0] = members fetch, call[1] = leads fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(global.fetch).mock.calls[1] as [string];
    expect(url).toContain("status=qualified");
  });

  it("includes sortBy and sortOrder in the API request when URL has those params", async () => {
    vi.mocked(useSearchParams).mockReturnValue(mockParams("sortBy=first_name&sortOrder=asc"));
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    // call[0] = members fetch, call[1] = leads fetch
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(global.fetch).mock.calls[1] as [string];
    expect(url).toContain("sortBy=first_name");
    expect(url).toContain("sortOrder=asc");
  });
});

// ---------------------------------------------------------------------------
// Filter bar rendering
// ---------------------------------------------------------------------------

describe("LeadsClient — filter bar", () => {
  it("renders the search input", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("searchbox", { name: /search leads/i })).toBeInTheDocument();
  });

  it("renders the status filter select", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("combobox", { name: /filter by status/i })).toBeInTheDocument();
  });

  it("renders the source filter select", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("combobox", { name: /filter by source/i })).toBeInTheDocument();
  });

  it("renders the sort select", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("combobox", { name: /sort leads/i })).toBeInTheDocument();
  });

  it("does not show the Clear button when no filters are active", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("shows the Clear button when a status filter is active", async () => {
    vi.mocked(useSearchParams).mockReturnValue(mockParams("status=qualified"));
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });

  it("shows the Clear button when a search filter is active", async () => {
    vi.mocked(useSearchParams).mockReturnValue(mockParams("search=ahmed"));
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filter interactions
// ---------------------------------------------------------------------------

describe("LeadsClient — filter interactions", () => {
  it("calls router.replace with status param when status select changes", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /filter by status/i }),
      "qualified"
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("status=qualified")
    );
  });

  it("calls router.replace with source param when source select changes", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /filter by source/i }),
      "website"
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("source=website")
    );
  });

  it("calls router.replace with sort params when sort select changes", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    await user.selectOptions(
      screen.getByRole("combobox", { name: /sort leads/i }),
      "first_name:asc"
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("sortBy=first_name")
    );
  });

  it("calls router.replace to clear all params when Clear is clicked", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useSearchParams).mockReturnValue(mockParams("status=qualified&search=ahmed"));
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    await user.click(screen.getByRole("button", { name: /clear/i }));

    // Should navigate to the plain pathname with no query params
    expect(mockReplace).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("updates URL with search param after typing in search input (debounced)", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    const searchInput = screen.getByRole("searchbox", { name: /search leads/i });
    await user.type(searchInput, "ahmed");

    // The debounce fires after 350ms — waitFor polls until the assertion passes
    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(
          expect.stringContaining("search=ahmed")
        );
      },
      { timeout: 1000 }
    );
  });
});

// ---------------------------------------------------------------------------
// Pagination controls
// ---------------------------------------------------------------------------

describe("LeadsClient — pagination", () => {
  it("hides pagination when the list is empty", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    expect(screen.queryByRole("button", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  it("shows pagination when leads are present", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse([makeLead(LEAD_ID_1)]) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    expect(screen.getByRole("button", { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
  });

  it("disables the Previous button on page 1", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse([makeLead(LEAD_ID_1)]) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("disables the Next button when fewer than limit results are returned", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse([makeLead(LEAD_ID_1)], 1, 20) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("enables Next when a full page of results is returned", async () => {
    const leads = Array.from({ length: 20 }, (_, i) =>
      makeLead(`0000000${String(i).padStart(1, "0")}-0000-4000-8000-000000000001`)
    );
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse(leads, 1, 20) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByRole("columnheader", { name: "Name" });

    expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
  });

  it("calls router.replace with page=2 when Next is clicked", async () => {
    const user = userEvent.setup();
    const mockReplace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>);

    const leads = Array.from({ length: 20 }, (_, i) =>
      makeLead(`0000000${String(i).padStart(1, "0")}-0000-4000-8000-000000000001`)
    );
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse(leads, 1, 20) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByRole("columnheader", { name: "Name" });

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("page=2")
    );
  });

  it("disables Previous and enables Next on page 2 (URL param)", async () => {
    // Simulate being on page 2 via URL params
    vi.mocked(useSearchParams).mockReturnValue(mockParams("page=2"));
    vi.mocked(global.fetch).mockResolvedValue(
      makeLeadsResponse([makeLead(LEAD_ID_1)], 2, 20) as Response
    );

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    expect(screen.getByRole("button", { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByText(/Page 2/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Create lead interaction
// ---------------------------------------------------------------------------

describe("LeadsClient — create lead", () => {
  it("shows the create form when 'New Lead' button is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    const newLeadButtons = screen.getAllByRole("button", { name: /new lead/i });
    await user.click(newLeadButtons[0]!);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("refreshes the lead list after a lead is successfully created", async () => {
    const user = userEvent.setup();

    // Call order on mount: (1) members fetch, (2) leads fetch.
    // After lead creation: (3) POST create, (4) leads refresh.
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeEmptyMembersResponse() as Response) // members
      .mockResolvedValueOnce(makeEmptyLeadsResponse() as Response)   // initial leads
      .mockResolvedValueOnce(makeCreateLeadResponse() as Response)   // POST create
      .mockResolvedValueOnce(
        makeLeadsResponse([
          makeLead(LEAD_ID_1, { first_name: "Ahmed", last_name: "Ali" }),
        ]) as Response
      ); // leads refresh

    render(<LeadsClient organizationId={ORG_A} />);
    await screen.findByText("No leads yet");

    await user.click(screen.getAllByRole("button", { name: /new lead/i })[0]!);
    await user.type(screen.getByLabelText(/first name/i), "Ahmed");
    await user.type(screen.getByLabelText(/last name/i), "Ali");
    await user.click(screen.getByRole("button", { name: /create lead/i }));

    expect(await screen.findByText("Ahmed Ali")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Owner filter (Phase 2.4.2)
// ---------------------------------------------------------------------------

const OWNER_ID = "eeeeeeee-0000-4000-8000-000000000099";
const MEMBERS_RESPONSE = {
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

describe("LeadsClient — owner filter bar", () => {
  it("renders an Owner filter select with 'All owners' and 'Unassigned' options", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    const ownerSelect = await screen.findByRole("combobox", { name: /filter by owner/i });
    expect(ownerSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /all owners/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /unassigned/i })).toBeInTheDocument();
  });

  it("shows members in the owner dropdown when members are loaded", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(MEMBERS_RESPONSE as Response)  // members fetch
      .mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    expect(
      await screen.findByRole("option", { name: "Sarah Manager" })
    ).toBeInTheDocument();
  });

  it("calls router.replace with owner_id param when owner filter changes", async () => {
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: vi.fn(), replace } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    const user = userEvent.setup();
    const ownerSelect = await screen.findByRole("combobox", { name: /filter by owner/i });
    await user.selectOptions(ownerSelect, "unassigned");

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("owner_id=unassigned"));
  });

  it("includes owner_id in the leads API fetch when owner filter is set in URL", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      mockParams({ owner_id: "unassigned" })
    );
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    await waitFor(() => {
      const calls = vi.mocked(global.fetch).mock.calls;
      const leadCall = calls.find(([url]) =>
        typeof url === "string" && url.includes("/leads") && !url.includes("/members")
      );
      expect(leadCall).toBeDefined();
      expect(leadCall![0]).toContain("owner_id=unassigned");
    });
  });
});

describe("LeadsClient — hide channel stubs", () => {
  it("omits exclude_channel_stubs from the fetch by default", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const leadCall = vi.mocked(global.fetch).mock.calls.find(
      ([url]) => typeof url === "string" && url.includes("/leads")
    );
    expect(leadCall?.[0]).not.toContain("exclude_channel_stubs");
  });

  it("sends exclude_channel_stubs=true when the control is enabled in the URL", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      mockParams({ exclude_channel_stubs: "true" })
    );
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);

    expect(
      await screen.findByRole("checkbox", { name: "Hide channel stubs" })
    ).toBeChecked();
    await waitFor(() => {
      const leadCall = vi.mocked(global.fetch).mock.calls.find(
        ([url]) => typeof url === "string" && url.includes("/leads")
      );
      expect(leadCall?.[0]).toContain("exclude_channel_stubs=true");
    });
  });

  it("calls router.replace with exclude_channel_stubs=true when checked", async () => {
    const replace = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Hide channel stubs",
    });
    await user.click(checkbox);

    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("exclude_channel_stubs=true")
    );
  });

  it("omits exclude_channel_stubs when the control is unchecked", async () => {
    const replace = vi.fn();
    vi.mocked(useSearchParams).mockReturnValue(
      mockParams({ exclude_channel_stubs: "true" })
    );
    vi.mocked(useRouter).mockReturnValue({
      push: vi.fn(),
      replace,
    } as unknown as ReturnType<typeof useRouter>);
    vi.mocked(global.fetch).mockResolvedValue(makeEmptyLeadsResponse() as Response);

    render(<LeadsClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Hide channel stubs",
    });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(replace).toHaveBeenCalled();
    const url = String(replace.mock.calls[0]?.[0]);
    expect(url).not.toContain("exclude_channel_stubs");
  });
});
