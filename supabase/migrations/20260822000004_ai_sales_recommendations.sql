-- =============================================================================
-- Migration: AI sales recommendations (server-owned next-best-action advice)
-- Created:   2026-08-22
-- Depends-on: 20260822000003_ai_sales_analyses.sql
--
-- PURPOSE
-- -------
-- Persist one advisory sales recommendation per inbound message.
-- Derived deterministically from AiPipelineSnapshot + validated 4.6 analysis.
-- Never executes tools, mutates CRM, or creates HITL rows.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.ai_sales_recommendation_status AS ENUM (
  'recorded',
  'failed'
);

CREATE TYPE public.ai_sales_recommendation_action AS ENUM (
  'ask_qualification_question',
  'provide_information',
  'suggest_follow_up',
  'suggest_appointment_approval',
  'suggest_human_handoff',
  'wait_for_customer',
  'defer_existing_control'
);


-- ---------------------------------------------------------------------------
-- 2. AI SALES RECOMMENDATIONS
-- ---------------------------------------------------------------------------

CREATE TABLE public.ai_sales_recommendations (
  id                          UUID                                         PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id             UUID                                         NOT NULL
                                                                             REFERENCES public.organizations(id)
                                                                             ON DELETE CASCADE,

  conversation_id             UUID                                         NOT NULL,
  lead_id                     UUID                                         NOT NULL
                                                                             REFERENCES public.leads(id)
                                                                             ON DELETE CASCADE,
  inbound_message_id          UUID                                         NOT NULL,
  inbound_message_created_at  TIMESTAMPTZ                                  NOT NULL,

  analysis_id                 UUID
                                                                             REFERENCES public.ai_sales_analyses(id)
                                                                             ON DELETE RESTRICT,

  policy_version              TEXT                                         NOT NULL
                                                                             CHECK (char_length(policy_version) BETWEEN 1 AND 64),

  status                      public.ai_sales_recommendation_status        NOT NULL,

  recommended_action          public.ai_sales_recommendation_action        NOT NULL,

  cited_analysis_action       TEXT
                                                                             CHECK (
                                                                               cited_analysis_action IS NULL
                                                                               OR cited_analysis_action IN (
                                                                                 'ask_qualification_question',
                                                                                 'provide_information',
                                                                                 'create_follow_up',
                                                                                 'request_appointment_approval',
                                                                                 'human_handoff',
                                                                                 'wait_for_customer'
                                                                               )
                                                                             ),

  requires_human_approval     BOOLEAN                                      NOT NULL,

  mapped_tool_name            TEXT
                                                                             CHECK (
                                                                               mapped_tool_name IS NULL
                                                                               OR mapped_tool_name IN (
                                                                                 'create_follow_up',
                                                                                 'create_appointment'
                                                                               )
                                                                             ),

  reason_codes                JSONB                                        NOT NULL
                                                                             CHECK (
                                                                               jsonb_typeof(reason_codes) = 'array'
                                                                               AND jsonb_array_length(reason_codes) BETWEEN 0 AND 8
                                                                             ),

  pipeline_snapshot           JSONB                                        NOT NULL,

  error_code                  TEXT
                                                                             CHECK (
                                                                               error_code IS NULL
                                                                               OR char_length(error_code) BETWEEN 1 AND 64
                                                                             ),

  requested_by_user_id        UUID                                         NOT NULL
                                                                             REFERENCES auth.users(id)
                                                                             ON DELETE RESTRICT,

  created_at                  TIMESTAMPTZ                                  NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ                                  NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_sales_recommendations_conversation_org_fk
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.conversations (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT ai_sales_recommendations_message_org_fk
    FOREIGN KEY (inbound_message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE
);

CREATE TRIGGER ai_sales_recommendations_updated_at
  BEFORE UPDATE ON public.ai_sales_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG + CONVERSATION/LEAD/INBOUND/ANALYSIS MATCH
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_ai_sales_recommendation_scope()
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.messages
    WHERE id = NEW.inbound_message_id
      AND organization_id = NEW.organization_id
      AND conversation_id = NEW.conversation_id
  ) THEN
    RAISE EXCEPTION 'inbound_message_id does not match this organization and conversation'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.analysis_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.ai_sales_analyses
      WHERE id = NEW.analysis_id
        AND organization_id = NEW.organization_id
        AND conversation_id = NEW.conversation_id
        AND lead_id = NEW.lead_id
        AND inbound_message_id = NEW.inbound_message_id
    ) THEN
      RAISE EXCEPTION 'analysis_id does not match this organization and inbound message'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_sales_recommendation_scope() FROM PUBLIC;

CREATE TRIGGER ai_sales_recommendations_scope
  BEFORE INSERT OR UPDATE OF
    conversation_id,
    lead_id,
    organization_id,
    inbound_message_id,
    analysis_id
  ON public.ai_sales_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ai_sales_recommendation_scope();


-- ---------------------------------------------------------------------------
-- 4. REASON_CODES UNIQUENESS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_ai_sales_recommendation_reason_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM jsonb_array_elements(NEW.reason_codes)
  ) <> (
    SELECT COUNT(DISTINCT value) FROM jsonb_array_elements(NEW.reason_codes)
  ) THEN
    RAISE EXCEPTION 'reason_codes must be unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(NEW.reason_codes) AS code
    WHERE code NOT IN (
      'analysis_unavailable',
      'low_confidence',
      'already_has_scheduled_appointment',
      'already_has_pending_follow_up',
      'already_has_pending_appointment_approval',
      'conversation_paused',
      'requires_human',
      'cited_model_action',
      'policy_override'
    )
  ) THEN
    RAISE EXCEPTION 'reason_codes contains an unknown value';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ai_sales_recommendation_reason_codes() FROM PUBLIC;

CREATE TRIGGER ai_sales_recommendations_reason_codes
  BEFORE INSERT OR UPDATE OF reason_codes
  ON public.ai_sales_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ai_sales_recommendation_reason_codes();


-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX ai_sales_recommendations_org_inbound_uidx
  ON public.ai_sales_recommendations (organization_id, inbound_message_id);

CREATE INDEX ai_sales_recommendations_org_conversation_created_idx
  ON public.ai_sales_recommendations (organization_id, conversation_id, created_at DESC);

CREATE INDEX ai_sales_recommendations_org_lead_created_idx
  ON public.ai_sales_recommendations (organization_id, lead_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_sales_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_sales_recommendations: members can select"
  ON public.ai_sales_recommendations
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_sales_recommendations: members can insert"
  ON public.ai_sales_recommendations
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_sales_recommendations: members can update"
  ON public.ai_sales_recommendations
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);
