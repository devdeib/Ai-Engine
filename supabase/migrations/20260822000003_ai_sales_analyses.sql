-- =============================================================================
-- Migration: AI sales analyses (advisory snapshot + structured judgment)
-- Created:   2026-08-22
-- Depends-on: 20260822000002_ai_tool_actions.sql
--
-- PURPOSE
-- -------
-- Persist one advisory sales analysis per inbound message.
-- Pipeline snapshot is server-derived fact. payload is model judgment.
-- Neither updates leads.status, leads.score, ownership, or approvals.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.ai_sales_analysis_status AS ENUM (
  'recorded',
  'failed'
);


-- ---------------------------------------------------------------------------
-- 2. AI SALES ANALYSES
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_sales_analyses (
  id                          UUID                                   PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id             UUID                                   NOT NULL
                                                                       REFERENCES public.organizations(id)
                                                                       ON DELETE CASCADE,

  conversation_id             UUID                                   NOT NULL,
  lead_id                     UUID                                   NOT NULL
                                                                       REFERENCES public.leads(id)
                                                                       ON DELETE CASCADE,
  inbound_message_id          UUID                                   NOT NULL,
  inbound_message_created_at  TIMESTAMPTZ                            NOT NULL,

  schema_version              TEXT                                   NOT NULL
                                                                       CHECK (char_length(schema_version) BETWEEN 1 AND 64),
  prompt_version              TEXT                                   NOT NULL
                                                                       CHECK (char_length(prompt_version) BETWEEN 1 AND 64),
  provider_name               TEXT                                   NOT NULL
                                                                       CHECK (char_length(provider_name) BETWEEN 1 AND 64),

  status                      public.ai_sales_analysis_status        NOT NULL,

  payload                     JSONB                                  NOT NULL,
  pipeline_snapshot           JSONB                                  NOT NULL,
  error_code                  TEXT
                                                                       CHECK (
                                                                         error_code IS NULL
                                                                         OR char_length(error_code) BETWEEN 1 AND 64
                                                                       ),

  requested_by_user_id        UUID                                   NOT NULL
                                                                       REFERENCES auth.users(id)
                                                                       ON DELETE RESTRICT,

  created_at                  TIMESTAMPTZ                            NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ                            NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_sales_analyses_conversation_org_fk
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.conversations (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT ai_sales_analyses_message_org_fk
    FOREIGN KEY (inbound_message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE
);

CREATE TRIGGER ai_sales_analyses_updated_at
  BEFORE UPDATE ON public.ai_sales_analyses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG + CONVERSATION/LEAD MATCH
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_ai_sales_analysis_scope()
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

REVOKE ALL ON FUNCTION public.enforce_ai_sales_analysis_scope() FROM PUBLIC;

CREATE TRIGGER ai_sales_analyses_scope
  BEFORE INSERT OR UPDATE OF conversation_id, lead_id, organization_id
  ON public.ai_sales_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ai_sales_analysis_scope();


-- ---------------------------------------------------------------------------
-- 4. INDEXES
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX ai_sales_analyses_org_inbound_uidx
  ON public.ai_sales_analyses (organization_id, inbound_message_id);

CREATE INDEX ai_sales_analyses_org_conversation_created_idx
  ON public.ai_sales_analyses (organization_id, conversation_id, created_at DESC);

CREATE INDEX ai_sales_analyses_org_lead_created_idx
  ON public.ai_sales_analyses (organization_id, lead_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_sales_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_sales_analyses: members can select"
  ON public.ai_sales_analyses
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_sales_analyses: members can insert"
  ON public.ai_sales_analyses
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_sales_analyses: members can update"
  ON public.ai_sales_analyses
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);
