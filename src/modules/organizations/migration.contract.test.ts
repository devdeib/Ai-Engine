import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260831000001_organization_sales_profiles.sql"
  ),
  "utf8"
);

describe("organization_sales_profiles migration contract", () => {
  it("is one row per organization with a foreign key", () => {
    expect(migration).toContain("organization_sales_profiles");
    expect(migration).toContain("REFERENCES public.organizations (id)");
    expect(migration).toContain("UNIQUE (organization_id)");
  });

  it("grants SELECT to members and INSERT/UPDATE only to owner/admin", () => {
    expect(migration).toContain(
      "auth_user_role_in_org(organization_id) IS NOT NULL"
    );
    expect(migration).toContain(
      "auth_user_role_in_org(organization_id) IN ('owner', 'admin')"
    );
    expect(migration).toContain("members can select");
    expect(migration).toContain("owners and admins can insert");
    expect(migration).toContain("owners and admins can update");
  });

  it("does not add a DELETE policy or custom prompt columns", () => {
    expect(migration.toLowerCase()).not.toMatch(/policy .*delete/i);
    expect(migration).not.toContain("system_prompt");
    expect(migration).not.toContain("custom_system_prompt");
    expect(migration).not.toContain("embedding");
    expect(migration).not.toMatch(/\bdocuments\b/);
  });

  it("does not alter frozen CRM or channel tables", () => {
    expect(migration).not.toContain("ALTER TABLE public.leads");
    expect(migration).not.toContain("ALTER TABLE public.conversations");
    expect(migration).not.toContain("ALTER TABLE public.messages");
    expect(migration).not.toContain("ALTER TABLE public.channel_accounts");
  });
});
