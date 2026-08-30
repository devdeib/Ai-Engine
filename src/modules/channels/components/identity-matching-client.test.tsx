import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { IdentityMatchingClient } from "./identity-matching-client";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IDENTITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const STUB_LEAD_ID = "22222222-2222-4222-8222-222222222222";

const identity = {
  id: IDENTITY_ID,
  organizationId: ORG_A,
  channelAccountId: ACCOUNT_ID,
  externalAddress: "+97455551234",
  leadId: STUB_LEAD_ID,
  createdAt: "2026-08-27T00:00:00Z",
};

const account = {
  id: ACCOUNT_ID,
  organizationId: ORG_A,
  channel: "whatsapp",
  status: "active",
  providerDestinationId: "dest-1",
  createdAt: "2026-08-27T00:00:00Z",
};

const candidate = {
  id: CANDIDATE_ID,
  firstName: "Ahmed",
  lastName: "Ali",
  email: "ahmed@example.com",
  phone: "+97455551234",
  companyName: "Acme",
  status: "new",
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function mockApis({
  identities = [identity],
  candidates = [candidate],
  accounts = [account],
  identityStatus = 200,
  candidateStatus = 200,
  patchStatus = 200,
  patchImpl,
}: {
  identities?: typeof identity[];
  candidates?: typeof candidate[];
  accounts?: typeof account[];
  identityStatus?: number;
  candidateStatus?: number;
  patchStatus?: number;
  patchImpl?: () => Promise<unknown>;
} = {}) {
  let attached = false;
  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (url.includes("secret") || url.includes("rotate")) {
      throw new Error("secret endpoints must not be requested");
    }
    if (url.includes("/channel-accounts")) {
      return jsonResponse({ data: accounts, meta: { page: 1, limit: 100, count: accounts.length } }) as Response;
    }
    if (url.includes("/match-candidates")) {
      return jsonResponse(
        {
          data: candidateStatus === 200 ? candidates : [],
          meta: { page: 1, limit: 20, count: candidates.length },
          error:
            candidateStatus === 200
              ? undefined
              : { code: "ERROR", message: "failed" },
        },
        candidateStatus
      ) as Response;
    }
    if (method === "PATCH") {
      attached = patchStatus === 200;
      if (patchImpl) return (await patchImpl()) as Response;
      return jsonResponse(
        {
          data: { ...identity, leadId: CANDIDATE_ID },
        },
        patchStatus
      ) as Response;
    }
    if (url.includes("/channel-identities")) {
      const rows = attached || identityStatus !== 200 ? [] : identities;
      return jsonResponse(
        {
          data: rows,
          meta: { page: 1, limit: 20, count: rows.length },
        },
        identityStatus
      ) as Response;
    }
    return jsonResponse({ data: [] }, 404) as Response;
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("IdentityMatchingClient", () => {
  it("shows a loading state while unmatched identities load", () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => undefined));
    const { container } = render(
      <IdentityMatchingClient organizationId={ORG_A} />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders unmatched identities without secrets", async () => {
    mockApis();
    render(<IdentityMatchingClient organizationId={ORG_A} />);

    expect(await screen.findByText("+97455551234")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText(/ingest stub lead/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("webhook");
    expect(document.body.textContent).not.toContain("access_token");
    expect(document.body.textContent).not.toContain("secret");
    expect(
      vi
        .mocked(global.fetch)
        .mock.calls.some(([url]) => String(url).includes("unmatched=true"))
    ).toBe(true);
  });

  it("shows an empty state when there are no unmatched identities", async () => {
    mockApis({ identities: [] });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    expect(
      await screen.findByText("No unmatched identities")
    ).toBeInTheDocument();
  });

  it("shows a 401 error for the identity list", async () => {
    mockApis({ identityStatus: 401 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    expect(await screen.findByText("Sign in is required.")).toBeInTheDocument();
  });

  it("shows a 403 error for the identity list", async () => {
    mockApis({ identityStatus: 403 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    expect(
      await screen.findByText("You do not have access to this organization.")
    ).toBeInTheDocument();
  });

  it("shows a generic error when the identity list fails", async () => {
    mockApis({ identityStatus: 500 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    expect(
      await screen.findByText(
        "Unable to load unmatched identities. Please try again."
      )
    ).toBeInTheDocument();
  });

  it("paginates the unmatched identity list", async () => {
    mockApis({
      identities: [identity],
    });
    vi.mocked(global.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/channel-accounts")) {
        return jsonResponse({ data: [account] }) as Response;
      }
      if (url.includes("/match-candidates")) {
        return jsonResponse({
          data: [],
          meta: { page: 1, limit: 20, count: 0 },
        }) as Response;
      }
      if (url.includes("/channel-identities")) {
        const page = new URL(url, "http://localhost").searchParams.get("page");
        return jsonResponse({
          data: [identity],
          meta: { page: Number(page), limit: 20, count: 20 },
        }) as Response;
      }
      return jsonResponse({}, (init?.method === "PATCH" ? 200 : 404)) as Response;
    });

    render(<IdentityMatchingClient organizationId={ORG_A} />);
    await screen.findByText("+97455551234");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next identity page" }));
    await waitFor(() => {
      const identityCalls = vi
        .mocked(global.fetch)
        .mock.calls.filter(
          ([url]) =>
            String(url).includes("/channel-identities") &&
            !String(url).includes("match-candidates")
        );
      expect(identityCalls.some(([url]) => String(url).includes("page=2"))).toBe(
        true
      );
    });
  });

  it("loads candidates and renders public fields only", async () => {
    mockApis();
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));

    expect(await screen.findByText("Ahmed Ali")).toBeInTheDocument();
    expect(screen.getByText("Email: ahmed@example.com")).toBeInTheDocument();
    expect(screen.getByText("Phone: +97455551234")).toBeInTheDocument();
    expect(screen.getByText("Company: Acme")).toBeInTheDocument();
    expect(screen.getByText("Status: New")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("notes");
    expect(document.body.textContent).not.toContain("score");
    expect(document.body.textContent).not.toContain("webhook");
  });

  it("shows an empty candidate state", async () => {
    mockApis({ candidates: [] });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    expect(
      await screen.findByText("No matching CRM leads found.")
    ).toBeInTheDocument();
  });

  it("shows candidate API failures including 404", async () => {
    mockApis({ candidateStatus: 404 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    expect(
      await screen.findByText("This channel identity was not found.")
    ).toBeInTheDocument();
  });

  it("shows 401 and 403 errors for candidates", async () => {
    mockApis({ candidateStatus: 401 });
    const first = render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    expect(await screen.findByText("Sign in is required.")).toBeInTheDocument();
    first.unmount();

    mockApis({ candidateStatus: 403 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    await user.click(await screen.findByText("+97455551234"));
    expect(
      await screen.findByText("You do not have access to this organization.")
    ).toBeInTheDocument();
  });

  it("paginates match candidates", async () => {
    mockApis();
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/channel-accounts")) {
        return jsonResponse({ data: [account] }) as Response;
      }
      if (url.includes("/match-candidates")) {
        const page = new URL(url, "http://localhost").searchParams.get("page");
        return jsonResponse({
          data: [candidate],
          meta: { page: Number(page), limit: 20, count: 20 },
        }) as Response;
      }
      if (url.includes("/channel-identities")) {
        return jsonResponse({
          data: [identity],
          meta: { page: 1, limit: 20, count: 1 },
        }) as Response;
      }
      return jsonResponse({}, 404) as Response;
    });

    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    await screen.findByText("Ahmed Ali");
    await user.click(screen.getByRole("button", { name: "Next candidate page" }));
    await waitFor(() => {
      expect(
        vi
          .mocked(global.fetch)
          .mock.calls.some(([url]) =>
            String(url).includes("match-candidates?page=2")
          )
      ).toBe(true);
    });
  });

  it("requires confirmation and PATCHes exactly { leadId }", async () => {
    mockApis();
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    await user.click(await screen.findByText("Ahmed Ali"));

    expect(
      screen.getByText(/The ingest stub lead is not deleted/i)
    ).toBeInTheDocument();
    const attach = screen.getByRole("button", { name: "Attach identity" });
    expect(attach).toBeEnabled();
    await user.click(attach);

    await waitFor(() => {
      const patchCall = vi.mocked(global.fetch).mock.calls.find(
        ([, init]) =>
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          init.method === "PATCH"
      );
      expect(patchCall).toBeDefined();
      expect(String(patchCall?.[0])).toContain(
        `/channel-identities/${IDENTITY_ID}`
      );
      expect(String(patchCall?.[0])).not.toContain("match-candidates");
      expect(patchCall?.[1]).toEqual(
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ leadId: CANDIDATE_ID }),
        })
      );
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Linked to Ahmed Ali"
    );
    expect(screen.getByText("No unmatched identities")).toBeInTheDocument();
  });

  it("prevents duplicate PATCH clicks while pending", async () => {
    let resolvePatch: ((value: unknown) => void) | undefined;
    mockApis({
      patchImpl: () =>
        new Promise((resolve) => {
          resolvePatch = resolve;
        }),
    });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    await user.click(await screen.findByText("Ahmed Ali"));
    const attach = await screen.findByRole("button", { name: "Attach identity" });
    await user.click(attach);
    expect(await screen.findByRole("button", { name: "Attaching…" })).toBeDisabled();
    const patchCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(
        ([, init]) =>
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          init.method === "PATCH"
      );
    expect(patchCalls).toHaveLength(1);
    resolvePatch?.(
      jsonResponse({ data: { ...identity, leadId: CANDIDATE_ID } })
    );
  });

  it("handles attach 422 without retrying", async () => {
    mockApis({ patchStatus: 422 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    await user.click(await screen.findByText("Ahmed Ali"));
    await user.click(screen.getByRole("button", { name: "Attach identity" }));
    expect(
      await screen.findByText("The attach request was invalid.")
    ).toBeInTheDocument();
    const patchCalls = vi
      .mocked(global.fetch)
      .mock.calls.filter(
        ([, init]) =>
          typeof init === "object" &&
          init !== null &&
          "method" in init &&
          init.method === "PATCH"
      );
    expect(patchCalls).toHaveLength(1);
  });

  it("handles attach 401, 403, and 404", async () => {
    for (const [status, message] of [
      [401, "Sign in is required."],
      [403, "You do not have access to this organization."],
      [404, "Identity or lead was not found."],
    ] as const) {
      mockApis({ patchStatus: status });
      const { unmount } = render(
        <IdentityMatchingClient organizationId={ORG_A} />
      );
      const user = userEvent.setup();
      await user.click(await screen.findByText("+97455551234"));
      await user.click(await screen.findByText("Ahmed Ali"));
      await user.click(screen.getByRole("button", { name: "Attach identity" }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      unmount();
    }
  });

  it("handles generic attach failure", async () => {
    mockApis({ patchStatus: 500 });
    render(<IdentityMatchingClient organizationId={ORG_A} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText("+97455551234"));
    await user.click(await screen.findByText("Ahmed Ali"));
    await user.click(screen.getByRole("button", { name: "Attach identity" }));
    expect(
      await screen.findByText("Unable to attach this identity. Please try again.")
    ).toBeInTheDocument();
  });
});
