/**
 * Tests for the ActivityTimeline component.
 *
 * Covers:
 *   - Loading skeleton shown while fetching
 *   - Activities rendered after successful fetch
 *   - Empty state when no activities exist
 *   - Fetch error with retry button
 *   - Form renders with type selector and content textarea
 *   - Form prevents submission when content is empty
 *   - Successful activity submission clears form and refreshes timeline
 *   - Server error shown inline without leaving the component
 *   - Type, content, and created_at are displayed for each activity
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ActivityTimeline } from "./activity-timeline";
import type { LeadActivity } from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVITY_ID_1 = "activ111-0000-0000-0000-000000000001";
const ACTIVITY_ID_2 = "activ222-0000-0000-0000-000000000002";

function makeActivity(overrides: Partial<LeadActivity> = {}): LeadActivity {
  return {
    id: ACTIVITY_ID_1,
    organization_id: ORG_A,
    lead_id: LEAD_ID,
    user_id: "user1111-0000-0000-0000-000000000001",
    type: "note",
    content: "Called the lead — very interested.",
    created_at: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function makeActivitiesResponse(activities: LeadActivity[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: activities, meta: { count: activities.length } }),
  };
}

function makePostSuccessResponse(activity: LeadActivity) {
  return {
    ok: true,
    status: 201,
    json: async () => ({ data: activity }),
  };
}

function makeErrorResponse(message = "Internal error") {
  return {
    ok: false,
    status: 500,
    json: async () => ({ error: { message } }),
  };
}

function make422Response(details: Record<string, string[]> = {}) {
  return {
    ok: false,
    status: 422,
    json: async () => ({ error: { code: "VALIDATION_ERROR", message: "Validation failed", details } }),
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
// Loading state
// ---------------------------------------------------------------------------

describe("ActivityTimeline — loading state", () => {
  it("shows an animated skeleton while fetching activities", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));

    const { container } = render(
      <ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />
    );

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("ActivityTimeline — empty state", () => {
  it("shows 'No activity recorded yet' when the API returns an empty list", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(
      await screen.findByText("No activity recorded yet.")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Activities rendering
// ---------------------------------------------------------------------------

describe("ActivityTimeline — activities rendering", () => {
  it("renders each activity's type label", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([
        makeActivity({ type: "note" }),
        makeActivity({ id: ACTIVITY_ID_2, type: "call" }),
      ]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    // Scope to the timeline list to avoid collision with the <select> options
    const list = await screen.findByRole("list", { name: /activity timeline/i });
    expect(within(list).getByText("Note")).toBeInTheDocument();
    expect(within(list).getByText("Call")).toBeInTheDocument();
  });

  it("renders each activity's content", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([
        makeActivity({ content: "Discussed pricing with the lead." }),
      ]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(
      await screen.findByText("Discussed pricing with the lead.")
    ).toBeInTheDocument();
  });

  it("renders a timestamp for each activity", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([makeActivity()]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    // The time element should be present
    await screen.findByText("Note");
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeInTheDocument();
    expect(timeEl?.getAttribute("dateTime")).toBe("2026-08-20T10:00:00Z");
  });

  it("renders the 'Activity timeline' accessible list", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([makeActivity()]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("Note");
    expect(
      screen.getByRole("list", { name: /activity timeline/i })
    ).toBeInTheDocument();
  });

  it("renders all five activity types with their labels", async () => {
    const activities: LeadActivity[] = [
      makeActivity({ id: "a1", type: "note" }),
      makeActivity({ id: "a2", type: "call" }),
      makeActivity({ id: "a3", type: "email" }),
      makeActivity({ id: "a4", type: "meeting" }),
      makeActivity({ id: "a5", type: "status_change" }),
    ];
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse(activities) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    // Scope to the timeline list to avoid collision with the <select> options
    const list = await screen.findByRole("list", { name: /activity timeline/i });
    expect(within(list).getByText("Note")).toBeInTheDocument();
    expect(within(list).getByText("Call")).toBeInTheDocument();
    expect(within(list).getByText("Email")).toBeInTheDocument();
    expect(within(list).getByText("Meeting")).toBeInTheDocument();
    expect(within(list).getByText("Status Change")).toBeInTheDocument();
  });

  it("renders conversation, follow-up, and appointment types with accessible labels", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([
        makeActivity({
          id: "c1",
          type: "conversation",
          content: "Conversation started",
        }),
        makeActivity({
          id: "f1",
          type: "follow_up",
          content: "Follow-up created: Call prospect",
        }),
        makeActivity({
          id: "p1",
          type: "appointment",
          content: "Appointment scheduled",
        }),
      ]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    const list = await screen.findByRole("list", { name: /activity timeline/i });
    expect(within(list).getByText("Conversation")).toBeInTheDocument();
    expect(within(list).getByText("Follow-up")).toBeInTheDocument();
    expect(within(list).getByText("Appointment")).toBeInTheDocument();
    expect(within(list).getByText("Conversation started")).toBeInTheDocument();
    expect(
      within(list).getByText("Follow-up created: Call prospect")
    ).toBeInTheDocument();
    expect(within(list).getByText("Appointment scheduled")).toBeInTheDocument();

    expect(
      screen.getByRole("listitem", { name: "Conversation activity" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Follow-up activity" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "Appointment activity" })
    ).toBeInTheDocument();
  });

  it("renders AI activity types with labels", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([
        makeActivity({
          id: "ai1",
          type: "ai",
          content: "AI response generated",
        }),
      ]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    const list = await screen.findByRole("list", { name: /activity timeline/i });
    expect(within(list).getByText("AI")).toBeInTheDocument();
    expect(within(list).getByText("AI response generated")).toBeInTheDocument();
    expect(
      screen.getByRole("listitem", { name: "AI activity" })
    ).toBeInTheDocument();
  });

  it("keeps newest-first order from the API response", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([
        makeActivity({
          id: "newer",
          type: "appointment",
          content: "Appointment completed",
          created_at: "2026-08-20T12:00:00Z",
        }),
        makeActivity({
          id: "older",
          type: "note",
          content: "Called the lead — very interested.",
          created_at: "2026-08-20T10:00:00Z",
        }),
      ]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    const list = await screen.findByRole("list", { name: /activity timeline/i });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveAccessibleName("Appointment activity");
    expect(items[1]).toHaveAccessibleName("Note activity");
  });
});

// ---------------------------------------------------------------------------
// Fetch error
// ---------------------------------------------------------------------------

describe("ActivityTimeline — fetch error", () => {
  it("shows an error message when the fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeErrorResponse() as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(
      await screen.findByText("Failed to load activity timeline.")
    ).toBeInTheDocument();
  });

  it("shows a Retry button when fetch fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue(makeErrorResponse() as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("Failed to load activity timeline.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("retries the fetch when Retry is clicked", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeErrorResponse() as Response) // first GET → error
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response); // retry GET → success

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    const retryBtn = await screen.findByRole("button", { name: /retry/i });
    await user.click(retryBtn);

    expect(
      await screen.findByText("No activity recorded yet.")
    ).toBeInTheDocument();
  });

  it("shows the error state when fetch throws a network error", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    expect(
      await screen.findByText("Failed to load activity timeline.")
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Form rendering
// ---------------------------------------------------------------------------

describe("ActivityTimeline — form", () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([]) as Response
    );
  });

  it("renders the log activity form with a type selector and content textarea", async () => {
    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    expect(screen.getByRole("combobox", { name: /activity type/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /activity content/i })).toBeInTheDocument();
  });

  it("renders all five type options in the selector", async () => {
    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    const select = screen.getByRole("combobox", { name: /activity type/i });
    const options = Array.from((select as HTMLSelectElement).options).map(
      (o) => o.textContent
    );
    expect(options).toContain("Note");
    expect(options).toContain("Call");
    expect(options).toContain("Email");
    expect(options).toContain("Meeting");
    expect(options).toContain("Status Change");
    expect(options).not.toContain("Conversation");
    expect(options).not.toContain("Follow-up");
    expect(options).not.toContain("Appointment");
    expect(options).toHaveLength(5);
  });

  it("defaults the type selector to 'Note'", async () => {
    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    const select = screen.getByRole("combobox", {
      name: /activity type/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("note");
  });

  it("renders the 'Log Activity' submit button", async () => {
    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    expect(
      screen.getByRole("button", { name: /log activity/i })
    ).toBeInTheDocument();
  });

  it("disables the submit button when content is empty", async () => {
    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    const btn = screen.getByRole("button", { name: /log activity/i });
    expect(btn).toBeDisabled();
  });

  it("enables the submit button when content is not empty", async () => {
    const user = userEvent.setup();

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");
    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Hello"
    );

    expect(screen.getByRole("button", { name: /log activity/i })).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Form submission — success
// ---------------------------------------------------------------------------

describe("ActivityTimeline — form submission: success", () => {
  it("calls the POST endpoint with the correct body", async () => {
    const user = userEvent.setup();
    const newActivity = makeActivity({ content: "Sent a follow-up email" });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response) // initial GET
      .mockResolvedValueOnce(makePostSuccessResponse(newActivity) as Response) // POST
      .mockResolvedValueOnce(makeActivitiesResponse([newActivity]) as Response); // re-fetch

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");
    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Sent a follow-up email"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    await waitFor(() => {
      const postCall = vi.mocked(global.fetch).mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST"
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall?.[1] as RequestInit)?.body as string) as {
        type: string;
        content: string;
      };
      expect(body.type).toBe("note");
      expect(body.content).toBe("Sent a follow-up email");
    });
  });

  it("clears the content textarea after a successful submission", async () => {
    const user = userEvent.setup();
    const newActivity = makeActivity({ content: "Followed up" });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(makePostSuccessResponse(newActivity) as Response)
      .mockResolvedValueOnce(makeActivitiesResponse([newActivity]) as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    const textarea = screen.getByRole("textbox", {
      name: /activity content/i,
    }) as HTMLTextAreaElement;
    await user.type(textarea, "Followed up");
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("re-fetches the timeline and displays the new activity", async () => {
    const user = userEvent.setup();
    const newActivity = makeActivity({ content: "Scheduled a demo" });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(makePostSuccessResponse(newActivity) as Response)
      .mockResolvedValueOnce(makeActivitiesResponse([newActivity]) as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Scheduled a demo"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    expect(await screen.findByText("Scheduled a demo")).toBeInTheDocument();
  });

  it("resets the type selector back to 'note' after successful submission", async () => {
    const user = userEvent.setup();
    const newActivity = makeActivity({ type: "call", content: "Called them" });

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(makePostSuccessResponse(newActivity) as Response)
      .mockResolvedValueOnce(makeActivitiesResponse([newActivity]) as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    const select = screen.getByRole("combobox", {
      name: /activity type/i,
    }) as HTMLSelectElement;
    await user.selectOptions(select, "call");
    expect(select.value).toBe("call");

    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Called them"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    await waitFor(() => {
      expect(select.value).toBe("note");
    });
  });
});

// ---------------------------------------------------------------------------
// Form submission — validation
// ---------------------------------------------------------------------------

describe("ActivityTimeline — form submission: client-side validation", () => {
  it("shows a validation error when trying to submit empty content", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    // Submit button is disabled when empty, so we verify it doesn't submit
    const btn = screen.getByRole("button", { name: /log activity/i });
    expect(btn).toBeDisabled();

    // Typing whitespace-only should not enable the button
    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "   "
    );
    expect(btn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Form submission — server error
// ---------------------------------------------------------------------------

describe("ActivityTimeline — form submission: server error", () => {
  it("shows a server error message without clearing the form", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response) // initial GET
      .mockResolvedValueOnce(makeErrorResponse("Server blew up") as Response); // POST error

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    const textarea = screen.getByRole("textbox", {
      name: /activity content/i,
    }) as HTMLTextAreaElement;
    await user.type(textarea, "A note");
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The content is preserved so the user can retry
    expect(textarea.value).toBe("A note");
  });

  it("shows a 422 validation error from the server", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(
        make422Response({ content: ["Content is required"] }) as Response
      );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "x"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("does not navigate away from the page on submit error", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(makeErrorResponse() as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Test"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    await screen.findByRole("alert");
    // Timeline and form are still visible
    expect(screen.getByRole("button", { name: /log activity/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// API endpoint construction
// ---------------------------------------------------------------------------

describe("ActivityTimeline — API endpoint construction", () => {
  it("fetches activities from the correct URL including organizationId and leadId", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      makeActivitiesResponse([]) as Response
    );

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);

    await screen.findByText("No activity recorded yet.");

    const [getUrl] = vi.mocked(global.fetch).mock.calls[0] as [string];
    expect(getUrl).toContain(`/organizations/${ORG_A}/leads/${LEAD_ID}/activities`);
    expect(getUrl).toContain("page=1");
    expect(getUrl).toContain("limit=20");
  });

  it("posts to the correct URL", async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch)
      .mockResolvedValueOnce(makeActivitiesResponse([]) as Response)
      .mockResolvedValueOnce(makePostSuccessResponse(makeActivity()) as Response)
      .mockResolvedValueOnce(makeActivitiesResponse([makeActivity()]) as Response);

    render(<ActivityTimeline organizationId={ORG_A} leadId={LEAD_ID} />);
    await screen.findByText("No activity recorded yet.");

    await user.type(
      screen.getByRole("textbox", { name: /activity content/i }),
      "Logged from test"
    );
    await user.click(screen.getByRole("button", { name: /log activity/i }));

    await waitFor(() => {
      const postCall = vi.mocked(global.fetch).mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "POST"
      );
      expect(postCall?.[0]).toContain(
        `/organizations/${ORG_A}/leads/${LEAD_ID}/activities`
      );
    });
  });
});
