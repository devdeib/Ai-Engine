/**
 * Sales-profile query tests. No live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TenantAccessError } from "@/lib/errors";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/modules/organizations/queries", () => ({
  requireOrgMembership: vi.fn(),
  requireOrgRole: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  requireOrgMembership,
  requireOrgRole,
} from "@/modules/organizations/queries";
import {
  getOrganizationSalesProfile,
  upsertOrganizationSalesProfile,
} from "@/modules/organizations/sales-profile";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";

const profileRow = {
  offering_summary: "Luxury villas",
  service_area: "Dubai Marina",
  qualification_criteria: "Ask budget and timeline",
  constraints: "Never invent prices",
  typical_next_step: "Arrange a viewing",
};

function mockMaybeSingle(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: row,
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  vi.mocked(createClient).mockResolvedValue({
    from,
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { from, select, eq };
}

describe("getOrganizationSalesProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the configured profile for the requested organization", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({
      role: "agent",
    } as never);
    const { eq } = mockMaybeSingle(profileRow);

    const result = await getOrganizationSalesProfile(ORG_A, USER_1);
    expect(requireOrgMembership).toHaveBeenCalledWith(ORG_A, USER_1);
    expect(eq).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(result.offering_summary).toBe("Luxury villas");
    expect(result.service_area).toBe("Dubai Marina");
  });

  it("returns an empty profile when no row exists", async () => {
    vi.mocked(requireOrgMembership).mockResolvedValue({
      role: "owner",
    } as never);
    mockMaybeSingle(null);

    const result = await getOrganizationSalesProfile(ORG_A, USER_1);
    expect(result).toEqual({
      offering_summary: null,
      service_area: null,
      qualification_criteria: null,
      constraints: null,
      typical_next_step: null,
    });
  });

  it("does not require membership for trusted userId-null reads, still scopes by org", async () => {
    const { eq } = mockMaybeSingle(profileRow);
    const result = await getOrganizationSalesProfile(ORG_A, null);
    expect(requireOrgMembership).not.toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(result.offering_summary).toBe("Luxury villas");
  });

  it("throws TenantAccessError before reading when membership fails", async () => {
    vi.mocked(requireOrgMembership).mockRejectedValue(new TenantAccessError());
    await expect(getOrganizationSalesProfile(ORG_B, USER_1)).rejects.toThrow(
      TenantAccessError
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("upsertOrganizationSalesProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an agent before touching the profile table", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new TenantAccessError());
    await expect(
      upsertOrganizationSalesProfile(ORG_A, USER_1, {
        offering_summary: "Houses",
      })
    ).rejects.toThrow(TenantAccessError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("inserts when no row exists and injects organization_id from the server", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ role: "owner" } as never);

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqRead = vi.fn().mockReturnValue({ maybeSingle });
    const selectRead = vi.fn().mockReturnValue({ eq: eqRead });

    const single = vi.fn().mockResolvedValue({
      data: { ...profileRow, offering_summary: "Houses" },
      error: null,
    });
    const selectInsert = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectInsert });

    const from = vi.fn().mockReturnValue({
      select: selectRead,
      insert,
    });
    vi.mocked(createClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const result = await upsertOrganizationSalesProfile(ORG_A, USER_1, {
      offering_summary: "Houses",
    });

    expect(requireOrgRole).toHaveBeenCalledWith(ORG_A, USER_1, [
      "owner",
      "admin",
    ]);
    expect(insert).toHaveBeenCalledWith({
      organization_id: ORG_A,
      offering_summary: "Houses",
      service_area: null,
      qualification_criteria: null,
      constraints: null,
      typical_next_step: null,
    });
    expect(result.offering_summary).toBe("Houses");
  });

  it("updates the existing row scoped to organization_id", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ role: "admin" } as never);

    const maybeSingle = vi.fn().mockResolvedValue({
      data: profileRow,
      error: null,
    });
    const eqRead = vi.fn().mockReturnValue({ maybeSingle });
    const selectRead = vi.fn().mockReturnValue({ eq: eqRead });

    const single = vi.fn().mockResolvedValue({
      data: { ...profileRow, service_area: "Palm Jumeirah" },
      error: null,
    });
    const selectUpdate = vi.fn().mockReturnValue({ single });
    const eqUpdate = vi.fn().mockReturnValue({ select: selectUpdate });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });

    const from = vi.fn().mockReturnValue({
      select: selectRead,
      update,
    });
    vi.mocked(createClient).mockResolvedValue({
      from,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const result = await upsertOrganizationSalesProfile(ORG_A, USER_1, {
      service_area: "Palm Jumeirah",
    });

    expect(update).toHaveBeenCalledWith({
      offering_summary: "Luxury villas",
      service_area: "Palm Jumeirah",
      qualification_criteria: "Ask budget and timeline",
      constraints: "Never invent prices",
      typical_next_step: "Arrange a viewing",
    });
    expect(eqUpdate).toHaveBeenCalledWith("organization_id", ORG_A);
    expect(result.service_area).toBe("Palm Jumeirah");
  });

  it("does not allow a cross-tenant update when role check fails for org B", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new TenantAccessError());
    await expect(
      upsertOrganizationSalesProfile(ORG_B, USER_1, {
        offering_summary: "Stolen",
      })
    ).rejects.toThrow(TenantAccessError);
  });
});
