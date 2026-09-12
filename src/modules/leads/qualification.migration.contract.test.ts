import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260912000001_lead_qualification_facts.sql"
  ),
  "utf8"
);

describe("lead qualification facts migration contract", () => {
  it("adds JSONB facts and a write timestamp on leads", () => {
    expect(migration).toContain("qualification_facts JSONB NOT NULL DEFAULT '{}'::jsonb");
    expect(migration).toContain("qualification_updated_at TIMESTAMPTZ NULL");
  });

  it("does not store qualification status or add a qualification table", () => {
    expect(migration).not.toContain("qualification_status");
    expect(migration).not.toContain("CREATE TABLE public.lead_qualification");
    expect(migration).not.toContain("required_qualification_fields");
  });

  it("expands the tool ledger without dropping existing write tools", () => {
    expect(migration).toContain("create_follow_up");
    expect(migration).toContain("create_appointment");
    expect(migration).toContain("record_customer_facts");
    expect(migration).toContain("'lead'");
  });
});
