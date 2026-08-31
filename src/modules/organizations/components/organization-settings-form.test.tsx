import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrganizationSettingsForm } from "./organization-settings-form";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";

const emptyProfile = {
  offering_summary: null,
  service_area: null,
  qualification_criteria: null,
  constraints: null,
  typical_next_step: null,
};

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

describe("OrganizationSettingsForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets an owner edit company name and profile, including an empty profile", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: emptyProfile }) as Response
    );

    render(
      <OrganizationSettingsForm
        organizationId={ORG_A}
        role="owner"
        initialName="Jane's Organization"
      />
    );

    expect(
      await screen.findByLabelText("Company name")
    ).toHaveValue("Jane's Organization");
    expect(screen.getByLabelText("What we sell")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.clear(screen.getByLabelText("Company name"));
    await user.type(screen.getByLabelText("Company name"), "Marina Homes");
    await user.type(screen.getByLabelText("What we sell"), "Waterfront apartments");
    await user.type(
      screen.getByLabelText("Service area / locations"),
      "Dubai Marina"
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ data: { name: "Marina Homes" } }) as Response
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...emptyProfile,
            offering_summary: "Waterfront apartments",
            service_area: "Dubai Marina",
          },
        }) as Response
      );

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Company profile saved.");
    });

    const calls = vi.mocked(fetch).mock.calls;
    const nameCall = calls.find(
      ([url, init]) =>
        String(url).endsWith(`/organizations/${ORG_A}`) &&
        (init as RequestInit | undefined)?.method === "PATCH"
    );
    const profileCall = calls.find(
      ([url, init]) =>
        String(url).includes("/sales-profile") &&
        (init as RequestInit | undefined)?.method === "PATCH"
    );
    expect(nameCall).toBeDefined();
    expect(JSON.parse(String((nameCall?.[1] as RequestInit).body))).toEqual({
      name: "Marina Homes",
    });
    expect(profileCall).toBeDefined();
    expect(JSON.parse(String((profileCall?.[1] as RequestInit).body))).toEqual({
      offering_summary: "Waterfront apartments",
      service_area: "Dubai Marina",
      qualification_criteria: "",
      constraints: "",
      typical_next_step: "",
    });
  });

  it("does not let an agent mutate", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ data: emptyProfile }) as Response
    );

    render(
      <OrganizationSettingsForm
        organizationId={ORG_A}
        role="agent"
        initialName="Acme Realty"
      />
    );

    expect(await screen.findByLabelText("Company name")).toBeDisabled();
    expect(screen.getByLabelText("What we sell")).toBeDisabled();
    expect(
      screen.getByText("Only owners and admins can change this profile.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("displays validation errors from the API", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ data: emptyProfile }) as Response
    );

    render(
      <OrganizationSettingsForm
        organizationId={ORG_A}
        role="admin"
        initialName="Acme"
      />
    );
    await screen.findByLabelText("Company name");

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          message: "Validation failed",
          details: { name: ["Name is too long"] },
        },
      }),
    } as Response);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Name is too long")).toBeInTheDocument();
  });
});
