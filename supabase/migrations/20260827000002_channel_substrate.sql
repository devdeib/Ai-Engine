-- =============================================================================
-- Migration: Channel substrate (Phase 5.1)
-- Created:   2026-08-27
-- Depends-on: 20260827000001_channel_enums.sql
--
-- PURPOSE
-- -------
-- Tenant-owned channel accounts + external identities, customer authorship,
-- AI job trigger/source, and a delivery outbox that is NOT an AI engine.
--
-- in_app uniqueness is unchanged (conversations_one_open_in_app_per_lead).
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.channel_account_status AS ENUM (
  'active',
  'paused',
  'disabled'
);

CREATE TYPE public.channel_kind AS ENUM (
  'test'
);

CREATE TYPE public.ai_execution_trigger_source AS ENUM (
  'operator',
  'channel_ingress'
);

CREATE TYPE public.channel_message_direction AS ENUM (
  'inbound',
  'outbound'
);

CREATE TYPE public.channel_delivery_status AS ENUM (
  'not_applicable',
  'queued',
  'sent',
  'delivered',
  'failed'
);

CREATE TYPE public.channel_delivery_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);


-- ---------------------------------------------------------------------------
-- 2. CHANNEL ACCOUNTS (our side — tenant authority)
-- ---------------------------------------------------------------------------

CREATE TABLE public.channel_accounts (
  id                      UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id         UUID                              NOT NULL
                                                              REFERENCES public.organizations(id)
                                                              ON DELETE CASCADE,

  channel                 public.channel_kind               NOT NULL,
  status                  public.channel_account_status     NOT NULL DEFAULT 'active',

  provider_destination_id TEXT                              NOT NULL
                                                              CHECK (char_length(provider_destination_id) BETWEEN 1 AND 128),

  created_by_user_id      UUID                              NOT NULL
                                                              REFERENCES auth.users(id)
                                                              ON DELETE RESTRICT,

  created_at              TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),

  CONSTRAINT channel_accounts_id_organization_id_key
    UNIQUE (id, organization_id)
);

CREATE TRIGGER channel_accounts_updated_at
  BEFORE UPDATE ON public.channel_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE UNIQUE INDEX channel_accounts_org_channel_destination_uidx
  ON public.channel_accounts (
    organization_id,
    channel,
    provider_destination_id
  );

CREATE INDEX channel_accounts_org_created_idx
  ON public.channel_accounts (organization_id, created_at DESC);


-- Secrets are NOT on channel_accounts so member SELECT cannot leak them.
-- No authenticated RLS policies: only service_role (bypass) may read/write.

CREATE TABLE public.channel_account_secrets (
  channel_account_id UUID        PRIMARY KEY
                                   REFERENCES public.channel_accounts(id)
                                   ON DELETE CASCADE,
  organization_id    UUID        NOT NULL
                                   REFERENCES public.organizations(id)
                                   ON DELETE CASCADE,
  webhook_secret     TEXT        NOT NULL
                                   CHECK (char_length(webhook_secret) BETWEEN 32 AND 128),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT channel_account_secrets_account_org_fk
    FOREIGN KEY (channel_account_id, organization_id)
    REFERENCES public.channel_accounts (id, organization_id)
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 3. CHANNEL IDENTITIES (their side — external participant)
-- ---------------------------------------------------------------------------

CREATE TABLE public.channel_identities (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id    UUID        NOT NULL
                                   REFERENCES public.organizations(id)
                                   ON DELETE CASCADE,

  channel_account_id UUID        NOT NULL,

  external_address   TEXT        NOT NULL
                                   CHECK (char_length(external_address) BETWEEN 1 AND 128),

  lead_id            UUID
                                   REFERENCES public.leads(id)
                                   ON DELETE SET NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT channel_identities_account_org_fk
    FOREIGN KEY (channel_account_id, organization_id)
    REFERENCES public.channel_accounts (id, organization_id)
    ON DELETE CASCADE
);

CREATE TRIGGER channel_identities_updated_at
  BEFORE UPDATE ON public.channel_identities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE UNIQUE INDEX channel_identities_account_address_uidx
  ON public.channel_identities (channel_account_id, external_address);

CREATE INDEX channel_identities_org_lead_idx
  ON public.channel_identities (organization_id, lead_id);

ALTER TABLE public.channel_identities
  ADD CONSTRAINT channel_identities_id_organization_id_key
  UNIQUE (id, organization_id);

CREATE OR REPLACE FUNCTION public.enforce_channel_identity_lead_same_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.leads
    WHERE id = NEW.lead_id
      AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'lead_id does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_channel_identity_lead_same_org() FROM PUBLIC;

CREATE TRIGGER channel_identities_lead_same_org
  BEFORE INSERT OR UPDATE OF lead_id, organization_id
  ON public.channel_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_channel_identity_lead_same_org();


-- ---------------------------------------------------------------------------
-- 4. CONVERSATIONS — external channel fields
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations
  ADD COLUMN channel_account_id UUID,
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_account_org_fk
    FOREIGN KEY (channel_account_id, organization_id)
    REFERENCES public.channel_accounts (id, organization_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT conversations_channel_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_scope_chk
  CHECK (
    (channel = 'in_app'
      AND channel_account_id IS NULL
      AND channel_identity_id IS NULL)
    OR
    (channel = 'test'
      AND channel_account_id IS NOT NULL
      AND channel_identity_id IS NOT NULL)
  );

-- Existing in_app unique index is preserved. External threads are separate.
CREATE UNIQUE INDEX conversations_one_open_external_per_identity
  ON public.conversations (organization_id, lead_id, channel_identity_id)
  WHERE channel = 'test' AND status = 'open' AND channel_identity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_conversation_channel_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel = 'in_app' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_accounts
    WHERE id = NEW.channel_account_id
      AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'channel_account_id does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.channel_identities
    WHERE id = NEW.channel_identity_id
      AND organization_id = NEW.organization_id
      AND channel_account_id = NEW.channel_account_id
      AND (lead_id IS NULL OR lead_id = NEW.lead_id)
  ) THEN
    RAISE EXCEPTION 'channel_identity_id does not match this conversation scope'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_conversation_channel_scope() FROM PUBLIC;

CREATE TRIGGER conversations_channel_scope
  BEFORE INSERT OR UPDATE OF channel, channel_account_id, channel_identity_id, lead_id, organization_id
  ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_conversation_channel_scope();


-- ---------------------------------------------------------------------------
-- 5. MESSAGES — customer authorship
-- ---------------------------------------------------------------------------

ALTER TABLE public.messages
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_channel_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.messages
  DROP CONSTRAINT messages_author_type_user_chk;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_author_type_user_chk
  CHECK (
    (author_type = 'human'
      AND author_user_id IS NOT NULL
      AND channel_identity_id IS NULL)
    OR
    (author_type = 'customer'
      AND author_user_id IS NULL
      AND channel_identity_id IS NOT NULL)
    OR
    (author_type IN ('ai', 'system')
      AND author_user_id IS NULL
      AND channel_identity_id IS NULL)
  );


-- ---------------------------------------------------------------------------
-- 6. CHANNEL MESSAGE REFS (provider metadata — off the AI contract)
-- ---------------------------------------------------------------------------

CREATE TABLE public.channel_message_refs (
  id                    UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id       UUID                              NOT NULL
                                                            REFERENCES public.organizations(id)
                                                            ON DELETE CASCADE,

  message_id            UUID                              NOT NULL,

  channel_account_id    UUID                              NOT NULL,
  channel_identity_id   UUID                              NOT NULL,

  direction             public.channel_message_direction  NOT NULL,

  provider_message_id   TEXT
                                                            CHECK (
                                                              provider_message_id IS NULL
                                                              OR char_length(provider_message_id) BETWEEN 1 AND 128
                                                            ),
  provider_thread_id    TEXT
                                                            CHECK (
                                                              provider_thread_id IS NULL
                                                              OR char_length(provider_thread_id) BETWEEN 1 AND 128
                                                            ),

  delivery_status       public.channel_delivery_status    NOT NULL,
  delivered_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  provider_error_code   TEXT
                                                            CHECK (
                                                              provider_error_code IS NULL
                                                              OR char_length(provider_error_code) BETWEEN 1 AND 64
                                                            ),

  created_at            TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),

  CONSTRAINT channel_message_refs_message_org_fk
    FOREIGN KEY (message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT channel_message_refs_account_org_fk
    FOREIGN KEY (channel_account_id, organization_id)
    REFERENCES public.channel_accounts (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT channel_message_refs_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE CASCADE
);

CREATE TRIGGER channel_message_refs_updated_at
  BEFORE UPDATE ON public.channel_message_refs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE UNIQUE INDEX channel_message_refs_message_uidx
  ON public.channel_message_refs (organization_id, message_id);

CREATE UNIQUE INDEX channel_message_refs_inbound_provider_uidx
  ON public.channel_message_refs (channel_account_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL AND direction = 'inbound';

CREATE INDEX channel_message_refs_org_account_created_idx
  ON public.channel_message_refs (organization_id, channel_account_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 7. CHANNEL DELIVERY JOBS (outbox — not an AI execution authority)
-- ---------------------------------------------------------------------------

CREATE TABLE public.channel_delivery_jobs (
  id                    UUID                                    PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id       UUID                                    NOT NULL
                                                                  REFERENCES public.organizations(id)
                                                                  ON DELETE CASCADE,

  channel_account_id    UUID                                    NOT NULL,
  message_id            UUID                                    NOT NULL,

  status                public.channel_delivery_job_status      NOT NULL DEFAULT 'pending',
  attempt_count         INTEGER                                 NOT NULL DEFAULT 0
                                                                  CHECK (attempt_count >= 0),
  max_attempts          INTEGER                                 NOT NULL DEFAULT 3
                                                                  CHECK (max_attempts >= 1 AND max_attempts <= 10),
  available_at          TIMESTAMPTZ                             NOT NULL DEFAULT NOW(),
  locked_at             TIMESTAMPTZ,
  last_error_code       TEXT,
  created_at            TIMESTAMPTZ                             NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ                             NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,

  CONSTRAINT channel_delivery_jobs_account_org_fk
    FOREIGN KEY (channel_account_id, organization_id)
    REFERENCES public.channel_accounts (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT channel_delivery_jobs_message_org_fk
    FOREIGN KEY (message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE
);

CREATE TRIGGER channel_delivery_jobs_updated_at
  BEFORE UPDATE ON public.channel_delivery_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE UNIQUE INDEX channel_delivery_jobs_org_message_uidx
  ON public.channel_delivery_jobs (organization_id, message_id);

CREATE INDEX channel_delivery_jobs_due_idx
  ON public.channel_delivery_jobs (available_at, status, organization_id);

CREATE OR REPLACE FUNCTION public.claim_channel_delivery_jobs(
  p_limit integer DEFAULT 1,
  p_organization_id uuid DEFAULT NULL,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.channel_delivery_jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 1;
  END IF;
  IF p_limit > 20 THEN
    p_limit := 20;
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 THEN
    p_lease_seconds := 90;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.channel_delivery_jobs AS j
    WHERE (p_organization_id IS NULL OR j.organization_id = p_organization_id)
      AND j.available_at <= NOW()
      AND j.attempt_count < j.max_attempts
      AND (
        j.status = 'pending'
        OR (
          j.status = 'processing'
          AND j.locked_at IS NOT NULL
          AND j.locked_at < NOW() - make_interval(secs => p_lease_seconds)
        )
      )
    ORDER BY j.created_at ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.channel_delivery_jobs AS job
  SET
    status = 'processing',
    locked_at = NOW(),
    attempt_count = job.attempt_count + 1,
    updated_at = NOW()
  FROM due
  WHERE job.id = due.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_channel_delivery_jobs(integer, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_channel_delivery_jobs(integer, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_channel_delivery_jobs(integer, uuid, integer) TO service_role;


-- ---------------------------------------------------------------------------
-- 8. AI EXECUTION JOBS — trigger source + nullable requester
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_execution_jobs
  ADD COLUMN trigger_source public.ai_execution_trigger_source NOT NULL DEFAULT 'operator',
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.ai_execution_jobs
  ALTER COLUMN requested_by_user_id DROP NOT NULL;

ALTER TABLE public.ai_execution_jobs
  ADD CONSTRAINT ai_execution_jobs_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.ai_execution_jobs
  ADD CONSTRAINT ai_execution_jobs_trigger_actor_chk
  CHECK (
    (trigger_source = 'operator'
      AND requested_by_user_id IS NOT NULL
      AND channel_identity_id IS NULL)
    OR
    (trigger_source = 'channel_ingress'
      AND requested_by_user_id IS NULL
      AND channel_identity_id IS NOT NULL)
  );


-- ---------------------------------------------------------------------------
-- 9. AI AUDIT ROWS — same actor contract
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_tool_actions
  ADD COLUMN trigger_source public.ai_execution_trigger_source NOT NULL DEFAULT 'operator',
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.ai_tool_actions
  ALTER COLUMN requested_by_user_id DROP NOT NULL;

ALTER TABLE public.ai_tool_actions
  ADD CONSTRAINT ai_tool_actions_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.ai_tool_actions
  ADD CONSTRAINT ai_tool_actions_trigger_actor_chk
  CHECK (
    (trigger_source = 'operator'
      AND requested_by_user_id IS NOT NULL
      AND channel_identity_id IS NULL)
    OR
    (trigger_source = 'channel_ingress'
      AND requested_by_user_id IS NULL
      AND channel_identity_id IS NOT NULL)
  );

ALTER TABLE public.ai_sales_analyses
  ADD COLUMN trigger_source public.ai_execution_trigger_source NOT NULL DEFAULT 'operator',
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.ai_sales_analyses
  ALTER COLUMN requested_by_user_id DROP NOT NULL;

ALTER TABLE public.ai_sales_analyses
  ADD CONSTRAINT ai_sales_analyses_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.ai_sales_analyses
  ADD CONSTRAINT ai_sales_analyses_trigger_actor_chk
  CHECK (
    (trigger_source = 'operator'
      AND requested_by_user_id IS NOT NULL
      AND channel_identity_id IS NULL)
    OR
    (trigger_source = 'channel_ingress'
      AND requested_by_user_id IS NULL
      AND channel_identity_id IS NOT NULL)
  );

ALTER TABLE public.ai_sales_recommendations
  ADD COLUMN trigger_source public.ai_execution_trigger_source NOT NULL DEFAULT 'operator',
  ADD COLUMN channel_identity_id UUID;

ALTER TABLE public.ai_sales_recommendations
  ALTER COLUMN requested_by_user_id DROP NOT NULL;

ALTER TABLE public.ai_sales_recommendations
  ADD CONSTRAINT ai_sales_recommendations_identity_org_fk
    FOREIGN KEY (channel_identity_id, organization_id)
    REFERENCES public.channel_identities (id, organization_id)
    ON DELETE RESTRICT;

ALTER TABLE public.ai_sales_recommendations
  ADD CONSTRAINT ai_sales_recommendations_trigger_actor_chk
  CHECK (
    (trigger_source = 'operator'
      AND requested_by_user_id IS NOT NULL
      AND channel_identity_id IS NULL)
    OR
    (trigger_source = 'channel_ingress'
      AND requested_by_user_id IS NULL
      AND channel_identity_id IS NOT NULL)
  );


-- ---------------------------------------------------------------------------
-- 10. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_accounts: members can select"
  ON public.channel_accounts
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "channel_accounts: members can insert"
  ON public.channel_accounts
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "channel_accounts: members can update"
  ON public.channel_accounts
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

ALTER TABLE public.channel_account_secrets ENABLE ROW LEVEL SECURITY;
-- No authenticated policies: members cannot read webhook secrets.

ALTER TABLE public.channel_identities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_identities: members can select"
  ON public.channel_identities
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

ALTER TABLE public.channel_message_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_message_refs: members can select"
  ON public.channel_message_refs
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

ALTER TABLE public.channel_delivery_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_delivery_jobs: members can select"
  ON public.channel_delivery_jobs
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "channel_delivery_jobs: members can insert"
  ON public.channel_delivery_jobs
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "channel_delivery_jobs: members can update"
  ON public.channel_delivery_jobs
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);
