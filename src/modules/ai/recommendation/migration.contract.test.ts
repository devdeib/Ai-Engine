import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(
  process.cwd(),
  "supabase/migrations/20260822000004_ai_sales_recommendations.sql"
);
const migration = readFileSync(file, "utf8");
const previous = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822000003_ai_sales_analyses.sql"),
  "utf8"
);

describe("ai_sales_recommendations migration contract", () => {
  it("is a new additive file and does not rewrite the 4.6 migration", () => {
    expect(migration).toContain("CREATE TABLE public.ai_sales_recommendations");
    expect(previous).not.toContain("ai_sales_recommendations");
    expect(migration).not.toContain("ALTER TABLE public.ai_sales_analyses");
    expect(migration).not.toContain("ALTER TABLE public.leads");
    expect(migration).not.toContain("ALTER TABLE public.conversations");
    expect(migration).not.toContain("ALTER TABLE public.messages");
    expect(migration).not.toContain("ALTER TABLE public.appointments");
    expect(migration).not.toContain("ALTER TABLE public.lead_follow_ups");
    expect(migration).not.toContain("ALTER TABLE public.ai_tool_actions");
  });

  it("declares the exact status and action enums", () => {
    expect(migration).toContain("ai_sales_recommendation_status");
    expect(migration).toContain("'recorded'");
    expect(migration).toContain("'failed'");
    expect(migration).toContain("'ask_qualification_question'");
    expect(migration).toContain("'provide_information'");
    expect(migration).toContain("'suggest_follow_up'");
    expect(migration).toContain("'suggest_appointment_approval'");
    expect(migration).toContain("'suggest_human_handoff'");
    expect(migration).toContain("'wait_for_customer'");
    expect(migration).toContain("'defer_existing_control'");
  });

  it("enforces one recommendation per inbound message per organization", () => {
    expect(migration).toContain("ai_sales_recommendations_org_inbound_uidx");
    expect(migration).toContain("(organization_id, inbound_message_id)");
  });

  it("uses composite tenant-safe foreign keys and a new same-org trigger", () => {
    expect(migration).toContain("ai_sales_recommendations_conversation_org_fk");
    expect(migration).toContain("ai_sales_recommendations_message_org_fk");
    expect(migration).toContain("REFERENCES public.ai_sales_analyses(id)");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("enforce_ai_sales_recommendation_scope");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.enforce_ai_sales_analysis_scope");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.enforce_ai_tool_action_scope");
  });

  it("adds conversation and lead created_at indexes plus updated_at", () => {
    expect(migration).toContain(
      "ai_sales_recommendations_org_conversation_created_idx"
    );
    expect(migration).toContain("ai_sales_recommendations_org_lead_created_idx");
    expect(migration).toContain("handle_updated_at()");
  });

  it("rejects unknown reason codes at the database layer", () => {
    expect(migration).toContain("reason_codes contains an unknown value");
    expect(migration).toContain("'cited_model_action'");
    expect(migration).toContain("'policy_override'");
  });

  it("uses member RLS without a DELETE policy", () => {
    expect(migration).toContain("auth_user_role_in_org(organization_id)");
    expect(migration).toContain("members can select");
    expect(migration).toContain("members can insert");
    expect(migration).toContain("members can update");
    expect(migration.toLowerCase()).not.toContain("members can delete");
  });
});
