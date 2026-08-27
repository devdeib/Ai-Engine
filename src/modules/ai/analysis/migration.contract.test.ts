import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822000003_ai_sales_analyses.sql"),
  "utf8"
);

describe("ai_sales_analyses migration contract", () => {
  it("enforces one analysis per inbound message per organization", () => {
    expect(migration).toContain("ai_sales_analyses_org_inbound_uidx");
    expect(migration).toContain("(organization_id, inbound_message_id)");
  });

  it("uses member RLS without a DELETE policy", () => {
    expect(migration).toContain("auth_user_role_in_org(organization_id)");
    expect(migration).toContain("members can select");
    expect(migration).toContain("members can insert");
    expect(migration).toContain("members can update");
    expect(migration.toLowerCase()).not.toContain("members can delete");
  });

  it("does not alter CRM tables", () => {
    expect(migration).not.toContain("ALTER TABLE public.leads");
    expect(migration).not.toContain("ALTER TABLE public.conversations");
    expect(migration).not.toContain("ALTER TABLE public.messages");
    expect(migration).not.toContain("ALTER TABLE public.appointments");
    expect(migration).not.toContain("ALTER TABLE public.lead_follow_ups");
  });
});
