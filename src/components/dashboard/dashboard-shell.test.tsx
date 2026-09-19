import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { OrganizationWithRole, Profile } from "@/lib/db/types";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard/identities"),
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

vi.mock("@/modules/auth/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/modules/organizations/actions", () => ({
  setCurrentOrganizationAction: vi.fn(),
}));

import { DashboardShell } from "./dashboard-shell";

const profile: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  display_name: "Agent User",
  avatar_url: null,
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
};

const organization: OrganizationWithRole = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  name: "Acme Realty",
  slug: "acme",
  created_at: "2026-08-20T00:00:00Z",
  updated_at: "2026-08-20T00:00:00Z",
  deleted_at: null,
  role: "agent",
};

describe("DashboardShell navigation", () => {
  it("brands the product as ZEUS", () => {
    render(
      <DashboardShell
        profile={profile}
        organizations={[organization]}
        currentOrganization={organization}
      >
        <div>content</div>
      </DashboardShell>
    );

    expect(screen.getAllByText("ZEUS").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI SALES AGENT").length).toBeGreaterThan(0);
  });

  it("includes Overview, Leads, Conversations, and Activity", () => {
    render(
      <DashboardShell
        profile={profile}
        organizations={[organization]}
        currentOrganization={organization}
      >
        <div>content</div>
      </DashboardShell>
    );

    expect(screen.getAllByRole("link", { name: "Overview" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Leads" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Conversations" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Activity" }).length).toBeGreaterThan(0);
  });
  it("includes a Channels item pointing at /dashboard/channels", () => {
    render(
      <DashboardShell
        profile={profile}
        organizations={[organization]}
        currentOrganization={organization}
      >
        <div>content</div>
      </DashboardShell>
    );

    const links = screen.getAllByRole("link", { name: "Channels" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dashboard/channels");
    }
  });

  it("includes a Channel Identities item pointing at /dashboard/identities", () => {
    render(
      <DashboardShell
        profile={profile}
        organizations={[organization]}
        currentOrganization={organization}
      >
        <div>content</div>
      </DashboardShell>
    );

    const links = screen.getAllByRole("link", { name: "Channel Identities" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/dashboard/identities");
    }
  });
});
