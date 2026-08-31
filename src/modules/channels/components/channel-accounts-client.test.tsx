import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import type { MemberRole } from "@/lib/db/types";

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
  },
}));

import { ChannelAccountsClient } from "./channel-accounts-client";

const ORG_A = "aaaaaaaa-0000-0000-4000-000000000001";
const ACCOUNT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCOUNT_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WEBHOOK_SECRET = "one-time-webhook-secret-value-shown-once";
const ABSOLUTE_WEBHOOK_URL = `https://app.example.com/api/v1/channels/accounts/${ACCOUNT_ID}/webhook`;

const publicAccount = {
  id: ACCOUNT_ID,
  organizationId: ORG_A,
  channel: "test" as const,
  status: "active" as const,
  providerDestinationId: "dest-1",
  createdAt: "2026-08-27T00:00:00Z",
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body) return undefined;
  return JSON.parse(String(init.body));
}

function collectionUrl(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return path.endsWith(`/organizations/${ORG_A}/channel-accounts`);
}

function firstMutation(): [unknown, RequestInit | undefined] {
  const call = mutationCalls()[0];
  expect(call).toBeDefined();
  return call as [unknown, RequestInit | undefined];
}

interface MockOptions {
  accounts?: Record<string, unknown>[];
  listStatus?: number;
  listMeta?: { page: number; limit: number; count: number };
  createStatus?: number;
  createData?: unknown;
  createError?: unknown;
  patchStatus?: number;
  rotateStatus?: number;
  rotateData?: unknown;
  createImpl?: (init?: RequestInit) => Promise<unknown>;
  patchImpl?: (init?: RequestInit) => Promise<unknown>;
  rotateImpl?: (init?: RequestInit) => Promise<unknown>;
}

function mockApis(options: MockOptions = {}) {
  const {
    accounts = [publicAccount],
    listStatus = 200,
    listMeta,
    createStatus = 201,
    createData,
    createError,
    patchStatus = 200,
    rotateStatus = 200,
    rotateData,
    createImpl,
    patchImpl,
    rotateImpl,
  } = options;

  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/secrets/rotate") && method === "POST") {
      if (rotateImpl) return rotateImpl(init) as Promise<Response>;
      if (rotateStatus >= 200 && rotateStatus < 300) {
        return jsonResponse(
          { data: rotateData ?? { ...publicAccount } },
          rotateStatus
        ) as Response;
      }
      return jsonResponse(
        { error: { code: "ERROR", message: "failed" } },
        rotateStatus
      ) as Response;
    }

    if (method === "PATCH" && url.includes(`/channel-accounts/${ACCOUNT_ID}`)) {
      if (patchImpl) return patchImpl(init) as Promise<Response>;
      if (patchStatus >= 200 && patchStatus < 300) {
        return jsonResponse({ data: publicAccount }, patchStatus) as Response;
      }
      return jsonResponse(
        { error: { code: "ERROR", message: "failed" } },
        patchStatus
      ) as Response;
    }

    if (method === "POST" && collectionUrl(url)) {
      if (createImpl) return createImpl(init) as Promise<Response>;
      if (createStatus >= 200 && createStatus < 300) {
        return jsonResponse(
          {
            data:
              createData ?? { ...publicAccount, webhookSecret: WEBHOOK_SECRET },
          },
          createStatus
        ) as Response;
      }
      return jsonResponse(
        createError ?? { error: { code: "ERROR", message: "failed" } },
        createStatus
      ) as Response;
    }

    if (method === "GET" && url.includes("/channel-accounts")) {
      return jsonResponse(
        {
          data: listStatus === 200 ? accounts : [],
          meta: listMeta ?? { page: 1, limit: 20, count: accounts.length },
        },
        listStatus
      ) as Response;
    }

    throw new Error(`unexpected ${method} ${url}`);
  });
}

function renderClient(role: MemberRole = "owner") {
  return render(
    <ChannelAccountsClient organizationId={ORG_A} memberRole={role} />
  );
}

function mutationCalls() {
  return vi.mocked(global.fetch).mock.calls.filter((call) => {
    const method = (
      (call[1] as RequestInit | undefined)?.method ?? "GET"
    ).toUpperCase();
    return method !== "GET";
  });
}

async function openCreateForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Create account" }));
  return screen.getByRole("form", { name: "Create channel account" });
}

function setValue(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

describe("ChannelAccountsClient", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup({ delay: null });
    vi.stubGlobal("fetch", vi.fn());
    mockApis();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders public account fields and not secrets from the list", async () => {
    mockApis({
      accounts: [
        {
          ...publicAccount,
          webhookSecret: "list-secret-must-not-render",
          accessToken: "token-must-not-render",
        },
      ],
    });
    renderClient();

    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Destination: dest-1")).toBeInTheDocument();
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByTestId("channel-webhook-url")).toHaveTextContent(
      ABSOLUTE_WEBHOOK_URL
    );
    expect(
      screen.queryByText(`Webhook: /api/v1/channels/accounts/${ACCOUNT_ID}/webhook`)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("list-secret-must-not-render")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("token-must-not-render")).not.toBeInTheDocument();

    const listCall = vi.mocked(global.fetch).mock.calls.find((call) => {
      const method = (
        (call[1] as RequestInit | undefined)?.method ?? "GET"
      ).toUpperCase();
      return method === "GET";
    });
    expect(String(listCall?.[0])).toBe(
      `/api/v1/organizations/${ORG_A}/channel-accounts?page=1&limit=20`
    );
    expect(String(listCall?.[0])).not.toContain("secret");
    expect(String(listCall?.[0])).not.toContain("webhookSecret");
  });

  it("shows a loading state", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(global.fetch).mockImplementation(async () => {
      await gate;
      return jsonResponse({
        data: [publicAccount],
        meta: { page: 1, limit: 20, count: 1 },
      }) as Response;
    });
    renderClient();
    expect(screen.getByText("Loading channel accounts…")).toBeInTheDocument();
    release?.();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  it("shows an empty state", async () => {
    mockApis({ accounts: [] });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("No channel accounts yet.")).toBeInTheDocument();
    });
  });

  it("paginates using the existing list metadata", async () => {
    vi.mocked(global.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("page=2")) {
        return jsonResponse({
          data: [
            {
              ...publicAccount,
              id: ACCOUNT_ID_2,
              providerDestinationId: "page-2-dest",
            },
          ],
          meta: { page: 2, limit: 20, count: 1 },
        }) as Response;
      }
      return jsonResponse({
        data: [{ ...publicAccount, providerDestinationId: "page-1-dest" }],
        meta: { page: 1, limit: 20, count: 20 },
      }) as Response;
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Destination: page-1-dest")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => {
      expect(screen.getByText("Destination: page-2-dest")).toBeInTheDocument();
    });
    expect(String(vi.mocked(global.fetch).mock.calls.at(-1)?.[0])).toContain(
      "page=2"
    );
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => {
      expect(screen.getByText("Destination: page-1-dest")).toBeInTheDocument();
    });
  });

  it("surfaces a 401 list error", async () => {
    mockApis({ listStatus: 401 });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Sign in is required.")).toBeInTheDocument();
    });
  });

  it("surfaces a 403 list error", async () => {
    mockApis({ listStatus: 403 });
    renderClient();
    await waitFor(() => {
      expect(
        screen.getByText("You do not have access to this organization.")
      ).toBeInTheDocument();
    });
  });

  it("surfaces a 422 list error", async () => {
    mockApis({ listStatus: 422 });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("The request was invalid.")).toBeInTheDocument();
    });
  });

  it("surfaces a generic list failure", async () => {
    mockApis({ listStatus: 500 });
    renderClient();
    await waitFor(() => {
      expect(
        screen.getByText("Unable to load channel accounts. Please try again.")
      ).toBeInTheDocument();
    });
  });

  it.each(["owner", "admin"] as MemberRole[])(
    "shows create, status, and rotate controls for %s",
    async (role) => {
      renderClient(role);
      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });
      expect(
        screen.getByRole("button", { name: "Create account" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Rotate credentials" })
      ).toBeInTheDocument();
    }
  );

  it("hides mutation controls for an agent", async () => {
    renderClient("agent");
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Create account" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Activate" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rotate credentials" })
    ).not.toBeInTheDocument();
  });

  it("creates a Test account with the existing payload and shows the one-time secret", async () => {
    mockApis({
      createData: { ...publicAccount, webhookSecret: WEBHOOK_SECRET },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    setValue(within(form).getByLabelText("Destination"), "dest-1");
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );

    await waitFor(() => {
      expect(screen.getByTestId("one-time-secret-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("one-time-secret-value")).toHaveTextContent(
      WEBHOOK_SECRET
    );
    expect(screen.getByText("Webhook secret — shown once")).toBeInTheDocument();

    const createCall = mutationCalls().find((call) => {
      const url = String(call[0]);
      const method = (
        (call[1] as RequestInit | undefined)?.method ?? "GET"
      ).toUpperCase();
      return method === "POST" && collectionUrl(url);
    });
    expect(parseBody(createCall?.[1] as RequestInit)).toEqual({
      channel: "test",
      provider_destination_id: "dest-1",
    });
  });

  it("creates a WhatsApp account with the required schema fields", async () => {
    mockApis({ createData: { ...publicAccount, channel: "whatsapp" } });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    await user.selectOptions(
      within(form).getByLabelText("Channel"),
      "whatsapp"
    );
    setValue(within(form).getByLabelText("Destination"), "123456789012345");
    setValue(within(form).getByLabelText("Access token"), "EAAG.token");
    setValue(within(form).getByLabelText("Webhook verify token"), "verify-me");
    setValue(within(form).getByLabelText("App secret"), "s".repeat(32));
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );

    await waitFor(() => {
      expect(mutationCalls().length).toBeGreaterThan(0);
    });
    expect(parseBody(firstMutation()[1])).toEqual({
      channel: "whatsapp",
      provider_destination_id: "123456789012345",
      access_token: "EAAG.token",
      webhook_verify_token: "verify-me",
      app_secret: "s".repeat(32),
    });
  });

  it("creates an Email account with the required schema fields", async () => {
    mockApis({ createData: { ...publicAccount, channel: "email" } });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    await user.selectOptions(within(form).getByLabelText("Channel"), "email");
    setValue(within(form).getByLabelText("Destination"), "inbox@example.com");
    setValue(within(form).getByLabelText("Access token"), "resend-key");
    setValue(
      within(form).getByLabelText("Webhook signing secret"),
      `whsec_${"a".repeat(32)}`
    );
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(mutationCalls().length).toBe(1));
    expect(parseBody(firstMutation()[1])).toEqual({
      channel: "email",
      provider_destination_id: "inbox@example.com",
      access_token: "resend-key",
      webhook_signing_secret: `whsec_${"a".repeat(32)}`,
    });
  });

  it("creates an SMS account with the required schema fields", async () => {
    mockApis({ createData: { ...publicAccount, channel: "sms" } });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    await user.selectOptions(within(form).getByLabelText("Channel"), "sms");
    setValue(within(form).getByLabelText("Destination"), "+15551234567");
    setValue(within(form).getByLabelText("Access token"), "twilio-key");
    setValue(
      within(form).getByLabelText("Webhook signing secret"),
      "b".repeat(32)
    );
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );

    await waitFor(() => expect(mutationCalls().length).toBe(1));
    expect(parseBody(firstMutation()[1])).toEqual({
      channel: "sms",
      provider_destination_id: "+15551234567",
      access_token: "twilio-key",
      webhook_signing_secret: "b".repeat(32),
    });
  });

  it("displays 422 create errors and preserves form state", async () => {
    mockApis({
      createStatus: 422,
      createError: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: { provider_destination_id: ["Destination is required"] },
        },
      },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    const destination = within(form).getByLabelText("Destination");
    setValue(destination, "keep-me");
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );

    await waitFor(() => {
      expect(screen.getByText("The request was invalid.")).toBeInTheDocument();
    });
    expect(screen.getByText("Destination is required")).toBeInTheDocument();
    expect(destination).toHaveValue("keep-me");
    expect(mutationCalls()).toHaveLength(1);
  });

  it("copies and dismisses the one-time secret without persisting it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const localSet = vi.spyOn(window.localStorage, "setItem");
    const sessionSet = vi.spyOn(window.sessionStorage, "setItem");
    mockApis({
      createData: { ...publicAccount, webhookSecret: WEBHOOK_SECRET },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    const form = await openCreateForm(user);
    setValue(within(form).getByLabelText("Destination"), "dest-1");
    await user.click(
      within(form).getByRole("button", { name: "Create account" })
    );
    await waitFor(() => {
      expect(screen.getByTestId("one-time-secret-value")).toHaveTextContent(
        WEBHOOK_SECRET
      );
    });

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(WEBHOOK_SECRET);
    expect(window.location.href).not.toContain(WEBHOOK_SECRET);
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("one-time-secret-panel")).not.toBeInTheDocument();
    expect(screen.queryByText(WEBHOOK_SECRET)).not.toBeInTheDocument();
    expect(localSet).not.toHaveBeenCalled();
    expect(sessionSet).not.toHaveBeenCalled();
    expect(
      mutationCalls().filter((call) => String(call[0]).includes("/secrets/rotate"))
    ).toHaveLength(0);
  });

  it.each(["active", "paused", "disabled"] as const)(
    "PATCHes only { status: %s }",
    async (status) => {
      mockApis({
        accounts: [
          {
            ...publicAccount,
            status: status === "active" ? "paused" : "active",
          },
        ],
      });
      renderClient();
      await waitFor(() => {
        expect(screen.getByText("Test")).toBeInTheDocument();
      });
      const label =
        status === "active" ? "Activate" : status === "paused" ? "Pause" : "Disable";
      await user.click(screen.getByRole("button", { name: label }));
      await waitFor(() => {
        expect(mutationCalls().length).toBe(1);
      });
      const call = firstMutation();
      expect(String(call[0])).toBe(
        `/api/v1/organizations/${ORG_A}/channel-accounts/${ACCOUNT_ID}`
      );
      expect(call[1]?.method).toBe("PATCH");
      expect(parseBody(call[1])).toEqual({ status });
    }
  );

  it("disables status controls while a status mutation is pending", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApis({
      accounts: [{ ...publicAccount, status: "paused" }],
      patchImpl: async () => {
        await gate;
        return jsonResponse({ data: publicAccount });
      },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Activate" })).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Activate" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Disable" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving…" }));
    expect(mutationCalls()).toHaveLength(1);
    release?.();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Saving…" })
      ).not.toBeInTheDocument();
    });
  });

  it("rotates Test credentials at the existing endpoint with an empty body", async () => {
    mockApis({
      rotateData: { ...publicAccount, webhookSecret: WEBHOOK_SECRET },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Rotate credentials" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm rotate" }));
    await waitFor(() => {
      expect(screen.getByTestId("one-time-secret-value")).toHaveTextContent(
        WEBHOOK_SECRET
      );
    });
    const rotateCall = firstMutation();
    expect(String(rotateCall[0])).toBe(
      `/api/v1/organizations/${ORG_A}/channel-accounts/${ACCOUNT_ID}/secrets/rotate`
    );
    expect(rotateCall[1]?.method).toBe("POST");
    expect(parseBody(rotateCall[1])).toEqual({});
    expect(parseBody(rotateCall[1])).not.toHaveProperty("channel");
    expect(parseBody(rotateCall[1])).not.toHaveProperty(
      "provider_destination_id"
    );
  });

  it("rotates WhatsApp credentials without channel or destination fields", async () => {
    mockApis({
      accounts: [{ ...publicAccount, channel: "whatsapp" }],
      rotateData: { ...publicAccount, channel: "whatsapp" },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Rotate credentials" })
    );
    const panel = screen.getByTestId("rotate-panel");
    setValue(within(panel).getByLabelText("Access token"), "EAAG.new");
    setValue(within(panel).getByLabelText("Webhook verify token"), "verify-2");
    setValue(within(panel).getByLabelText("App secret"), "n".repeat(32));
    await user.click(screen.getByRole("button", { name: "Confirm rotate" }));
    await waitFor(() => expect(mutationCalls()).toHaveLength(1));
    const rotateCall = firstMutation();
    const body = parseBody(rotateCall[1]) as Record<string, unknown>;
    expect(String(rotateCall[0])).toContain(`/secrets/rotate`);
    expect(body).toEqual({
      access_token: "EAAG.new",
      webhook_verify_token: "verify-2",
      app_secret: "n".repeat(32),
    });
    expect(body).not.toHaveProperty("channel");
    expect(body).not.toHaveProperty("provider_destination_id");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("id");
  });

  it("disables rotate while pending", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApis({
      rotateImpl: async () => {
        await gate;
        return jsonResponse({
          data: { ...publicAccount, webhookSecret: WEBHOOK_SECRET },
        });
      },
    });
    renderClient();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Rotate credentials" })
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Rotate credentials" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm rotate" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rotating…" })).toBeDisabled();
    });
    await user.click(screen.getByRole("button", { name: "Rotating…" }));
    expect(
      mutationCalls().filter((call) => String(call[0]).includes("/secrets/rotate"))
    ).toHaveLength(1);
    release?.();
    await waitFor(() => {
      expect(screen.getByTestId("one-time-secret-panel")).toBeInTheDocument();
    });
  });

  it.each([
    [401, "Sign in is required."],
    [403, "You do not have access to this organization."],
    [404, "This channel account was not found."],
    [422, "The request was invalid."],
    [500, "Unable to update this channel account."],
  ] as const)(
    "surfaces status error %s without retrying",
    async (status, message) => {
      mockApis({
        accounts: [{ ...publicAccount, status: "paused" }],
        patchStatus: status,
      });
      renderClient();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Activate" })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Activate" }));
      await waitFor(() => {
        expect(screen.getByText(message)).toBeInTheDocument();
      });
      expect(mutationCalls()).toHaveLength(1);
    }
  );

  it("surfaces rotate 403 without retrying", async () => {
    mockApis({ rotateStatus: 403 });
    renderClient();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Rotate credentials" })
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: "Rotate credentials" })
    );
    await user.click(screen.getByRole("button", { name: "Confirm rotate" }));
    await waitFor(() => {
      expect(
        screen.getByText("You do not have access to this organization.")
      ).toBeInTheDocument();
    });
    expect(
      mutationCalls().filter((call) => String(call[0]).includes("/secrets/rotate"))
    ).toHaveLength(1);
  });

  it("renders and copies the absolute webhook URL without secrets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByTestId("channel-webhook-url")).toHaveTextContent(
        ABSOLUTE_WEBHOOK_URL
      );
    });
    expect(screen.getByTestId("channel-webhook-url").textContent).not.toContain(
      "secret"
    );
    expect(screen.getByTestId("channel-webhook-url").textContent).not.toContain(
      ORG_A
    );

    await user.click(screen.getByRole("button", { name: "Copy webhook URL" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(ABSOLUTE_WEBHOOK_URL);
    expect(writeText).not.toHaveBeenCalledWith(WEBHOOK_SECRET);
    expect(mutationCalls()).toHaveLength(0);
  });

  it("shows a copy failure without mutating the account", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy webhook URL" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Copy webhook URL" }));
    await waitFor(() => {
      expect(screen.getByText("Unable to copy webhook URL.")).toBeInTheDocument();
    });
    expect(mutationCalls()).toHaveLength(0);
  });

  it("shows Test destination and webhook setup guidance", async () => {
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Use the webhook URL above with the generated Test webhook secret."
      )
    ).toBeInTheDocument();

    const form = await openCreateForm(user);
    expect(
      within(form).getByText(
        "A stable destination identifier for this test channel."
      )
    ).toBeInTheDocument();
  });

  it("shows WhatsApp Phone Number ID and Meta webhook guidance", async () => {
    mockApis({
      accounts: [{ ...publicAccount, channel: "whatsapp" }],
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Configure the webhook URL above in the Meta app. GET challenge and POST events use the same URL."
      )
    ).toBeInTheDocument();

    const form = await openCreateForm(user);
    await user.selectOptions(within(form).getByLabelText("Channel"), "whatsapp");
    expect(
      within(form).getByText(
        "WhatsApp Phone Number ID from Meta, not the visible phone number."
      )
    ).toBeInTheDocument();
    expect(
      within(form).getByText("Meta WhatsApp Cloud API access token.")
    ).toBeInTheDocument();
    expect(
      within(form).getByText(
        "The token you choose in Meta when configuring the webhook challenge."
      )
    ).toBeInTheDocument();
    expect(
      within(form).getByText(
        "Meta App Secret used to verify X-Hub-Signature-256."
      )
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Access token")).toBeInTheDocument();
    expect(
      within(form).getByLabelText("Webhook verify token")
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("App secret")).toBeInTheDocument();
  });

  it("shows Email mailbox and Resend whsec_ guidance", async () => {
    mockApis({
      accounts: [{ ...publicAccount, channel: "email" }],
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("Email")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Configure the webhook URL above as the Resend webhook endpoint. Inbound email.received events are handled there."
      )
    ).toBeInTheDocument();

    const form = await openCreateForm(user);
    await user.selectOptions(within(form).getByLabelText("Channel"), "email");
    expect(
      within(form).getByText(
        "The receiving mailbox for this channel, for example sales@example.com."
      )
    ).toBeInTheDocument();
    expect(within(form).getByText("Resend API key.")).toBeInTheDocument();
    expect(
      within(form).getByText(
        "Resend / Svix signing secret starting with whsec_."
      )
    ).toBeInTheDocument();
  });

  it("shows SMS E.164 and Telnyx Ed25519 guidance without HMAC wording", async () => {
    mockApis({
      accounts: [{ ...publicAccount, channel: "sms" }],
    });
    renderClient();
    await waitFor(() => {
      expect(screen.getByText("SMS")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Configure the webhook URL above as the Telnyx messaging webhook."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/HMAC/i)).not.toBeInTheDocument();

    const form = await openCreateForm(user);
    await user.selectOptions(within(form).getByLabelText("Channel"), "sms");
    expect(
      within(form).getByText(
        "The Telnyx receiving phone number in E.164 format, for example +15551234567."
      )
    ).toBeInTheDocument();
    expect(within(form).getByText("Telnyx API key.")).toBeInTheDocument();
    expect(
      within(form).getByText(
        "Telnyx Ed25519 public key used for webhook verification."
      )
    ).toBeInTheDocument();
    expect(within(form).queryByText(/HMAC/i)).not.toBeInTheDocument();
  });
});
