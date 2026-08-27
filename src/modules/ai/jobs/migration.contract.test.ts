import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260822000001_ai_execution_jobs.sql"
  ),
  "utf8"
);

describe("ai_execution_jobs migration contract", () => {
  it("claims atomically with SKIP LOCKED and a reclaimable lease", () => {
    expect(migration).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(migration).toContain("p_lease_seconds");
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain("locked_at < NOW() - make_interval(secs => p_lease_seconds)");
  });

  it("enforces one job per inbound message per organization", () => {
    expect(migration).toContain("ai_execution_jobs_org_inbound_uidx");
    expect(migration).toContain("(organization_id, inbound_message_id)");
  });

  it("does not store prompts, secrets, or CRM context", () => {
    expect(migration.toLowerCase()).not.toContain("prompt");
    expect(migration.toLowerCase()).not.toContain("api_key");
    expect(migration.toLowerCase()).not.toContain("openai");
  });
});
