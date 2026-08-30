import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const enums = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000001_channel_enums.sql"),
  "utf8"
);
const substrate = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000002_channel_substrate.sql"),
  "utf8"
);
const reliability = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000003_channel_reliability.sql"),
  "utf8"
);
const generalization = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000004_external_channel_generalization.sql"),
  "utf8"
);
const whatsapp = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260827000005_whatsapp_channel.sql"),
  "utf8"
);

describe("channel substrate migration contract", () => {
  it("adds only the test conversation channel", () => {
    expect(enums).toContain("ADD VALUE IF NOT EXISTS 'test'");
    expect(enums.toLowerCase()).not.toContain("whatsapp");
    expect(enums.toLowerCase()).not.toContain("'email'");
    expect(enums.toLowerCase()).not.toContain("'sms'");
  });

  it("preserves in_app uniqueness and adds external identity uniqueness", () => {
    expect(substrate).toContain("conversations_one_open_external_per_identity");
    expect(substrate).not.toContain("DROP INDEX IF EXISTS conversations_one_open_in_app_per_lead");
    expect(substrate).not.toContain("DROP INDEX conversations_one_open_in_app_per_lead");
  });

  it("keeps secrets off channel_accounts and without member SELECT", () => {
    expect(substrate).toContain("CREATE TABLE public.channel_account_secrets");
    expect(substrate).toContain("No authenticated policies: members cannot read webhook secrets");
    expect(substrate).not.toContain("channel_account_secrets: members can select");
  });

  it("enforces the channel_ingress actor contract", () => {
    expect(substrate).toContain("ai_execution_jobs_trigger_actor_chk");
    expect(substrate).toContain("trigger_source = 'channel_ingress'");
    expect(substrate).toContain("requested_by_user_id IS NULL");
  });

  it("does not grant delivery jobs AI execution authority", () => {
    expect(substrate).toContain("claim_channel_delivery_jobs");
    expect(substrate).not.toContain("processConversationMessage");
  });
});

describe("channel reliability migration contract", () => {
  it("adds persist_channel_inbound without dropping inbound uniqueness or RLS", () => {
    expect(reliability).toContain("CREATE OR REPLACE FUNCTION public.persist_channel_inbound");
    expect(reliability).toContain("EXCEPTION");
    expect(reliability).toContain("WHEN unique_violation THEN");
    expect(reliability).toContain("GRANT EXECUTE ON FUNCTION public.persist_channel_inbound");
    expect(reliability).toContain("TO service_role");
    expect(reliability).not.toContain("DROP INDEX");
    expect(reliability).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(reliability).not.toContain("DROP POLICY");
  });

  it("does not introduce WhatsApp, Email, or SMS", () => {
    expect(reliability.toLowerCase()).not.toContain("whatsapp");
    expect(reliability.toLowerCase()).not.toContain("'email'");
    expect(reliability.toLowerCase()).not.toContain("'sms'");
  });
});

describe("external-channel generalization migration contract", () => {
  it("generalizes external conversation scope without adding providers or weakening RLS", () => {
    expect(generalization).toContain("channel <> 'in_app'");
    expect(generalization).toContain("conversations_channel_scope_chk");
    expect(generalization).toContain("conversations_one_open_external_per_identity");
    expect(generalization).toContain("CREATE OR REPLACE FUNCTION public.persist_channel_inbound");
    expect(generalization).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(generalization).not.toContain("DROP POLICY");
    expect(generalization.toLowerCase()).not.toContain("whatsapp");
    expect(generalization.toLowerCase()).not.toContain("'email'");
    expect(generalization.toLowerCase()).not.toContain("'sms'");
    expect(generalization).not.toContain("ADD VALUE");
  });
});

describe("WhatsApp channel migration contract", () => {
  it("adds WhatsApp enum values additively without dropping existing constraints", () => {
    expect(whatsapp).toContain("ADD VALUE IF NOT EXISTS 'whatsapp'");
    expect(whatsapp).toContain("ALTER TYPE public.conversation_channel");
    expect(whatsapp).toContain("ALTER TYPE public.channel_kind");
    expect(whatsapp).not.toContain("DROP TYPE");
    expect(whatsapp).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(whatsapp).not.toContain("DROP POLICY");
    expect(whatsapp.toLowerCase()).not.toContain("'email'");
    expect(whatsapp.toLowerCase()).not.toContain("'sms'");
  });

  it("adds nullable WhatsApp secret columns without weakening webhook_secret length", () => {
    expect(whatsapp).toContain("provider_access_token TEXT NULL");
    expect(whatsapp).toContain("webhook_verify_token TEXT NULL");
    expect(whatsapp).toContain("BETWEEN 1 AND 4096");
    expect(whatsapp).not.toContain(
      "provider_access_token IS NULL\n    OR char_length(provider_access_token) BETWEEN 32 AND 128"
    );
    expect(substrate).toContain(
      "CHECK (char_length(webhook_secret) BETWEEN 32 AND 128)"
    );
  });
});

describe("Email channel migration contract", () => {
  const email = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260827000006_email_channel.sql"),
    "utf8"
  );

  it("adds Email enum values additively without changing RLS or uniqueness", () => {
    expect(email).toContain("ADD VALUE IF NOT EXISTS 'email'");
    expect(email).toContain("ALTER TYPE public.conversation_channel");
    expect(email).toContain("ALTER TYPE public.channel_kind");
    expect(email).not.toContain("DROP TYPE");
    expect(email).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(email).not.toContain("DROP POLICY");
    expect(email).not.toContain("DROP CONSTRAINT");
    expect(email.toLowerCase()).not.toContain("'sms'");
    expect(email).not.toContain("DROP CONSTRAINT conversations_channel_scope_chk");
    expect(email).not.toContain("DROP INDEX");
    expect(email).not.toContain("ALTER TABLE");
  });
});

describe("SMS channel migration contract", () => {
  const sms = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260828000001_sms_channel.sql"),
    "utf8"
  );

  it("adds SMS enum values additively without changing RLS, tables, or uniqueness", () => {
    expect(sms).toContain("ADD VALUE IF NOT EXISTS 'sms'");
    expect(sms).toContain("ALTER TYPE public.conversation_channel");
    expect(sms).toContain("ALTER TYPE public.channel_kind");
    expect(sms).not.toContain("DROP TYPE");
    expect(sms).not.toContain("DISABLE ROW LEVEL SECURITY");
    expect(sms).not.toContain("DROP POLICY");
    expect(sms).not.toContain("DROP CONSTRAINT");
    expect(sms).not.toContain("CREATE TABLE");
    expect(sms).not.toContain("CREATE INDEX");
    expect(sms).not.toContain("DROP INDEX");
    expect(sms).not.toContain("ALTER TABLE");
  });

  it("does not appear in historical channel migrations", () => {
    expect(enums.toLowerCase()).not.toContain("'sms'");
    expect(substrate.toLowerCase()).not.toContain("'sms'");
    expect(reliability.toLowerCase()).not.toContain("'sms'");
    expect(generalization.toLowerCase()).not.toContain("'sms'");
    expect(whatsapp.toLowerCase()).not.toContain("'sms'");
    const email = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260827000006_email_channel.sql"),
      "utf8"
    );
    expect(email.toLowerCase()).not.toContain("'sms'");
  });
});

describe("channel account lifecycle RLS migration contract", () => {
  const lifecycle = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260830000001_channel_account_lifecycle_rls.sql"
    ),
    "utf8"
  );

  it("replaces only channel_accounts INSERT and UPDATE policies additively", () => {
    expect(lifecycle).toContain(
      'DROP POLICY IF EXISTS "channel_accounts: members can insert"'
    );
    expect(lifecycle).toContain(
      'DROP POLICY IF EXISTS "channel_accounts: members can update"'
    );
    expect(lifecycle).toContain("IN ('owner', 'admin')");
    expect(lifecycle).not.toContain(
      'DROP POLICY IF EXISTS "channel_accounts: members can select"'
    );
    expect(lifecycle).not.toContain("CREATE TABLE");
    expect(lifecycle).not.toContain("CREATE INDEX");
    expect(lifecycle).not.toContain("CREATE FUNCTION");
    expect(lifecycle).not.toContain("CREATE TYPE");
    expect(lifecycle).not.toContain("ADD VALUE");
    expect(lifecycle).not.toContain("channel_account_secrets");
    expect(lifecycle).not.toContain("channel_identities");
  });

  it("leaves historical SELECT and secret policies unchanged", () => {
    expect(substrate).toContain("channel_accounts: members can select");
    expect(substrate).toContain("channel_accounts: members can insert");
    expect(substrate).toContain("channel_accounts: members can update");
    expect(substrate).toContain(
      "No authenticated policies: members cannot read webhook secrets"
    );
    expect(substrate).not.toContain("owners and admins can insert");
    expect(lifecycle).toContain("owners and admins can insert");
    expect(lifecycle).toContain("owners and admins can update");
    expect(lifecycle).not.toContain("DISABLE ROW LEVEL SECURITY");
  });
});
