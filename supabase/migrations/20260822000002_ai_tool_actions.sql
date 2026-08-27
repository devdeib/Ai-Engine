-- =============================================================================
-- Migration: AI tool actions (write idempotency + HITL)
-- Created:   2026-08-22
-- Depends-on: 20260822000001_ai_execution_jobs.sql
--
-- PURPOSE
-- -------
-- Durable, tenant-scoped records for Phase 4.5 write tools:
--   create_follow_up     — autonomous; idempotent CRM create
--   create_appointment   — human approval required; no appointment until approve
--
-- Pending HITL work MUST NOT live on ai_execution_jobs (90s lease) or on
-- CRM tables (would pollute human queues with unapproved AI fiction).
--
-- Additive idempotency_key on lead_follow_ups / appointments is NULL for
-- all human-created rows. AI writes set it to the action id.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.ai_tool_action_trust AS ENUM (
  'autonomous',
  'human_approval'
);

CREATE TYPE public.ai_tool_action_status AS ENUM (
  'pending',
  'executing',
  'executed',
  'rejected',
  'expired',
  'failed'
);


-- ---------------------------------------------------------------------------
-- 2. AI TOOL ACTIONS
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_tool_actions (
  id                     UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id        UUID                              NOT NULL
                                                             REFERENCES public.organizations(id)
                                                             ON DELETE CASCADE,

  conversation_id        UUID                              NOT NULL,
  lead_id                UUID                              NOT NULL
                                                             REFERENCES public.leads(id)
                                                             ON DELETE CASCADE,
  inbound_message_id     UUID                              NOT NULL,

  tool_name              TEXT                              NOT NULL
                                                             CHECK (tool_name IN (
                                                               'create_follow_up',
                                                               'create_appointment'
                                                             )),

  trust                  public.ai_tool_action_trust       NOT NULL,
  status                 public.ai_tool_action_status      NOT NULL,

  input_hash             TEXT                              NOT NULL
                                                             CHECK (char_length(input_hash) = 64),

  payload                JSONB                             NOT NULL,
  result_summary         JSONB,
  result_resource_type   TEXT
                                                             CHECK (
                                                               result_resource_type IS NULL
                                                               OR result_resource_type IN (
                                                                 'lead_follow_up',
                                                                 'appointment'
                                                               )
                                                             ),
  result_resource_id     UUID,

  requested_by_user_id   UUID                              NOT NULL
                                                             REFERENCES auth.users(id)
                                                             ON DELETE RESTRICT,
  approved_by_user_id    UUID
                                                             REFERENCES auth.users(id)
                                                             ON DELETE RESTRICT,

  decided_at             TIMESTAMPTZ,
  executed_at            TIMESTAMPTZ,
  expires_at             TIMESTAMPTZ,
  error_code             TEXT,

  created_at             TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_tool_actions_conversation_org_fk
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.conversations (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT ai_tool_actions_message_org_fk
    FOREIGN KEY (inbound_message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT ai_tool_actions_hitl_expires_chk
    CHECK (
      (trust = 'human_approval' AND expires_at IS NOT NULL)
      OR trust = 'autonomous'
    )
);

CREATE TRIGGER ai_tool_actions_updated_at
  BEFORE UPDATE ON public.ai_tool_actions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG + CONVERSATION/LEAD MATCH
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_ai_tool_action_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.leads
    WHERE id = NEW.lead_id
      AND organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'lead_id does not belong to this organization'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations
    WHERE id = NEW.conversation_id
      AND organization_id = NEW.organization_id
      AND lead_id = NEW.lead_id
  ) THEN
    RAISE EXCEPTION 'conversation_id does not match this organization and lead'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_tool_action_scope() FROM PUBLIC;

CREATE TRIGGER ai_tool_actions_scope
  BEFORE INSERT OR UPDATE OF conversation_id, lead_id, organization_id
  ON public.ai_tool_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ai_tool_action_scope();


-- ---------------------------------------------------------------------------
-- 4. INDEXES
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX ai_tool_actions_org_inbound_tool_hash_uidx
  ON public.ai_tool_actions (
    organization_id,
    inbound_message_id,
    tool_name,
    input_hash
  );

CREATE INDEX ai_tool_actions_org_status_created_idx
  ON public.ai_tool_actions (organization_id, status, created_at DESC);

CREATE INDEX ai_tool_actions_org_conversation_created_idx
  ON public.ai_tool_actions (organization_id, conversation_id, created_at DESC);

CREATE INDEX ai_tool_actions_org_lead_created_idx
  ON public.ai_tool_actions (organization_id, lead_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_tool_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_tool_actions: members can select"
  ON public.ai_tool_actions
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_tool_actions: members can insert"
  ON public.ai_tool_actions
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_tool_actions: members can update"
  ON public.ai_tool_actions
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);


-- ---------------------------------------------------------------------------
-- 6. IDEMPOTENCY KEYS ON CRM TABLES (AI writes only; humans stay NULL)
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_follow_ups
  ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX lead_follow_ups_org_idempotency_uidx
  ON public.lead_follow_ups (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX appointments_org_idempotency_uidx
  ON public.appointments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
