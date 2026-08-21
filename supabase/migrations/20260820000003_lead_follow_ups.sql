-- =============================================================================
-- Migration: Lead follow-ups
-- Created:   2026-08-20
-- Depends-on: 20260820000002_conversations.sql
--
-- PURPOSE
-- -------
-- Concrete next sales actions attached to a lead: due date, title, optional
-- notes, optional assignee, and a simple lifecycle (pending / completed /
-- cancelled).
--
-- "Overdue" is NOT a stored status. It is derived as:
--   status = 'pending' AND due_at < now()
--
-- Follow-ups are the source of truth for this data.
-- Do NOT duplicate follow-up records into lead_activities in this milestone.
--
-- TENANT INTEGRITY
-- ----------------
-- lead_id → leads(id) ON DELETE CASCADE.
-- Same-organization match is enforced by trigger
--   enforce_follow_up_lead_same_org() (same approach as conversations —
--   avoids ALTER TABLE leads ADD UNIQUE (id, organization_id)).
-- assigned_user_id is nullable; application layer verifies membership when set.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPE
-- ---------------------------------------------------------------------------

CREATE TYPE public.lead_follow_up_status AS ENUM (
  'pending',
  'completed',
  'cancelled'
);


-- ---------------------------------------------------------------------------
-- 2. TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.lead_follow_ups (
  id                UUID                              PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id   UUID                              NOT NULL
                                                        REFERENCES public.organizations(id)
                                                        ON DELETE CASCADE,

  lead_id           UUID                              NOT NULL
                                                        REFERENCES public.leads(id)
                                                        ON DELETE CASCADE,

  assigned_user_id  UUID
                                                        REFERENCES auth.users(id)
                                                        ON DELETE SET NULL,

  title             TEXT                              NOT NULL
                                                        CHECK (char_length(title) BETWEEN 1 AND 200),

  notes             TEXT
                                                        CHECK (
                                                          notes IS NULL
                                                          OR char_length(notes) BETWEEN 1 AND 2000
                                                        ),

  due_at            TIMESTAMPTZ                       NOT NULL,

  status            public.lead_follow_up_status      NOT NULL DEFAULT 'pending',

  created_at        TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ                       NOT NULL DEFAULT NOW()
);

CREATE TRIGGER lead_follow_ups_updated_at
  BEFORE UPDATE ON public.lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG GUARD FOR follow_up.lead_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_follow_up_lead_same_org()
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
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_follow_up_lead_same_org() FROM PUBLIC;

CREATE TRIGGER lead_follow_ups_lead_same_org
  BEFORE INSERT OR UPDATE OF lead_id, organization_id
  ON public.lead_follow_ups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_follow_up_lead_same_org();


-- ---------------------------------------------------------------------------
-- 4. INDEXES
--
-- Access patterns:
--   a) Lead timeline:     (organization_id, lead_id, due_at)
--   b) Status queue:      (organization_id, status, due_at)
--   c) Assignee queue:    (organization_id, assigned_user_id, status, due_at)
-- ---------------------------------------------------------------------------

CREATE INDEX lead_follow_ups_org_lead_due_idx
  ON public.lead_follow_ups (organization_id, lead_id, due_at);

CREATE INDEX lead_follow_ups_org_status_due_idx
  ON public.lead_follow_ups (organization_id, status, due_at);

CREATE INDEX lead_follow_ups_org_assignee_status_due_idx
  ON public.lead_follow_ups (organization_id, assigned_user_id, status, due_at);


-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--
-- SELECT / INSERT / UPDATE — any organization member.
-- DELETE — intentionally absent. Lifecycle is complete / cancel, not delete.
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_follow_ups: members can select"
  ON public.lead_follow_ups
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

CREATE POLICY "lead_follow_ups: members can insert"
  ON public.lead_follow_ups
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

CREATE POLICY "lead_follow_ups: members can update"
  ON public.lead_follow_ups
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  )
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );
