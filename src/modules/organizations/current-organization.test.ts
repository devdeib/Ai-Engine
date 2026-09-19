import { describe, it, expect } from "vitest";
import type { OrganizationWithRole } from "@/lib/db/types";
import { resolveCurrentOrganization } from "./current-organization";

function org(
  id: string,
  name: string,
  createdAt: string
): OrganizationWithRole {
  return {
    id,
    name,
    slug: id,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    role: "owner",
  };
}

describe("resolveCurrentOrganization", () => {
  it("returns null when the user has no organizations", () => {
    expect(resolveCurrentOrganization([])).toBeNull();
  });

  it("uses the preferred organization when the user belongs to it", () => {
    const personal = org("1", "Adeib Bismar's Organization", "2026-01-01T00:00:00Z");
    const vox = org("2", "Vox Real Estate", "2026-02-01T00:00:00Z");
    expect(resolveCurrentOrganization([personal, vox], "1")).toEqual(personal);
  });

  it("prefers a business workspace over a personal signup organization", () => {
    const personal = org("1", "Adeib Bismar's Organization", "2026-03-01T00:00:00Z");
    const vox = org("2", "Vox Real Estate", "2026-02-01T00:00:00Z");
    expect(resolveCurrentOrganization([personal, vox])).toEqual(vox);
  });
});
