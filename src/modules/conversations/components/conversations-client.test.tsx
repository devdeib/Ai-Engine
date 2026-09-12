/**
 * Tests for ConversationsClient — inbox list, URL selection, pagination,
 * empty/error states, and create-conversation entry.
 *
 * NO LIVE API. fetch and next/navigation are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { ConversationsClient } from "./conversations-client";
import type { ConversationWithLead, Lead, Message } from "@/lib/db/types";

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

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams() as unknown),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: mockReplace })),
  usePathname: vi.fn(() => "/dashboard/conversations"),
}));

import { useSearchParams } from "next/navigation";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const LEAD_1 = "11111111-1111-4111-8111-111111111111";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const CONV_2 = "cccccccc-0000-4000-8000-000000000002";

function mockParams(init?: string | Record<string, string>) {
  return new URLSearchParams(init) as unknown as ReturnType<typeof useSearchParams>;
}

function makeConversation(
  overrides: Partial<ConversationWithLead> = {}
): ConversationWithLead {
  return {
    id: CONV_1,
    organization_id: ORG_A,
    lead_id: LEAD_1,
    channel: "in_app",
    status: "open",
    requires_human: false,
    ai_paused_at: null,
    channel_account_id: null,
    channel_identity_id: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T11:00:00Z",
    lead: {
      id: LEAD_1,
      first_name: "Ahmed",
      last_name: "Ali",
      company_name: "Acme Corp",
    },
    ...overrides,
  };
}

function makeLead(): Lead {
  return {
    id: LEAD_1,
    organization_id: ORG_A,
    owner_id: null,
    first_name: "Ahmed",
    last_name: "Ali",
    email: null,
    phone: null,
    company_name: "Acme Corp",
    source: "other",
    status: "new",
    score: null,
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    qualification_facts: {},
    qualification_updated_at: null,
  };
}

function ok(data: unknown, meta?: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => (meta ? { data, meta } : { data }),
  };
}

function makeFetchMock(options?: {
  conversations?: ConversationWithLead[];
  meta?: { page: number; limit: number; count: number };
  listError?: boolean;
}) {
  const conversations = options?.conversations ?? [makeConversation()];
  const meta = options?.meta ?? {
    page: 1,
    limit: 20,
    count: conversations.length,
  };

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/messages") && method === "GET") {
      return ok([] as Message[], { page: 1, limit: 20, count: 0 });
    }
    if (url.includes("/leads") && method === "GET") {
      return ok([makeLead()], { page: 1, limit: 100, count: 1 });
    }
    if (url.includes("/conversations") && method === "POST") {
      return ok(makeConversation(), undefined, 201);
    }
    if (/\/conversations\/[0-9a-f-]+$/i.test(url.split("?")[0] ?? "") && method === "GET") {
      return ok(conversations[0] ?? makeConversation());
    }
    if (url.includes("/conversations") && method === "GET") {
      if (options?.listError) {
        return { ok: false, status: 500, json: async () => ({ error: { message: "fail" } }) };
      }
      return ok(conversations, meta);
    }
    return { ok: false, status: 500, json: async () => ({ error: { message: "unhandled" } }) };
  });
}

beforeEach(() => {
  mockReplace.mockClear();
  vi.mocked(useSearchParams).mockReturnValue(mockParams());
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("ConversationsClient — list", () => {
  it("renders a loading skeleton before conversations arrive", () => {
    global.fetch = vi.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
    const { container } = render(<ConversationsClient organizationId={ORG_A} />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders conversations with lead name, status, and updated time", async () => {
    global.fetch = makeFetchMock() as unknown as typeof fetch;
    render(<ConversationsClient organizationId={ORG_A} />);

    expect(await screen.findByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(
      "2026-08-01T11:00:00Z"
    );
  });

  it("renders the empty state when there are no conversations", async () => {
    global.fetch = makeFetchMock({ conversations: [] }) as unknown as typeof fetch;
    render(<ConversationsClient organizationId={ORG_A} />);

    expect(await screen.findByText("No conversations yet")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /start conversation/i }).length
    ).toBeGreaterThan(0);
  });

  it("renders an error state with retry", async () => {
    const user = userEvent.setup();
    const fetchMock = makeFetchMock({ listError: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    expect(await screen.findByText("Failed to load conversations")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("selects a conversation and writes it to the URL", async () => {
    const user = userEvent.setup();
    global.fetch = makeFetchMock({
      conversations: [
        makeConversation(),
        makeConversation({
          id: CONV_2,
          lead: {
            id: LEAD_1,
            first_name: "Sara",
            last_name: "Hassan",
            company_name: null,
          },
        }),
      ],
    }) as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    expect(await screen.findByText("Sara Hassan")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /sara hassan/i }));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining(`conversation=${CONV_2}`)
    );
  });

  it("marks the selected conversation from the URL", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      mockParams({ conversation: CONV_1 })
    );
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    const selected = await screen.findByRole("button", { name: /ahmed ali/i });
    expect(selected).toHaveAttribute("aria-current", "true");
  });
});

describe("ConversationsClient — pagination", () => {
  it("disables Previous on page 1 and Next when fewer than the limit", async () => {
    global.fetch = makeFetchMock({
      conversations: [makeConversation()],
      meta: { page: 1, limit: 20, count: 1 },
    }) as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("enables Next when the page is full and advances the page in the URL", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 20 }, (_, i) =>
      makeConversation({
        id: `cccccccc-0000-4000-8000-${String(i).padStart(12, "0")}`,
      })
    );
    global.fetch = makeFetchMock({
      conversations: rows,
      meta: { page: 1, limit: 20, count: 20 },
    }) as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    await screen.findAllByText("Ahmed Ali");

    const next = screen.getByRole("button", { name: /next page/i });
    expect(next).not.toBeDisabled();
    await user.click(next);
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("page=2"));
  });
});

describe("ConversationsClient — create", () => {
  it("opens the create form from the header action", async () => {
    const user = userEvent.setup();
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    render(<ConversationsClient organizationId={ORG_A} />);
    await screen.findByText("Ahmed Ali");

    await user.click(screen.getAllByRole("button", { name: /start conversation/i })[0]!);
    const dialog = screen.getByRole("dialog", { name: /start conversation/i });
    expect(within(dialog).getByLabelText(/lead/i)).toBeInTheDocument();
  });
});
