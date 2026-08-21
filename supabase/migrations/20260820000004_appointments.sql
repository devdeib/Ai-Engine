-- =============================================================================
-- Migration: Appointments
-- Created:   2026-08-20
-- Depends-on: 20260820000003_lead_follow_ups.sql
--
-- PURPOSE
-- -------
-- Human-operated CRM appointments: a scheduled meeting/viewing attached to a
-- lead. This is NOT a calendar integration and does not send reminders.
--
-- "Overdue" is NOT a stored status. A scheduled appointment whose starts_at
-- is in the past remains 'scheduled' until a human completes or cancels it.
--
-- Appointments are the source of truth for this data.
-- Do NOT duplicate appointment records into lead_activities in this milestone.
--
-- TENANT INTEGRITY
-- ----------------
-- lead_id → leads(id) ON DELETE CASCADE.
-- Same-organization match is enforced by trigger
--   enforce_appointment_lead_same_org() (same approach as conversations and
--   follow-ups — avoids ALTER TABLE leads ADD UNIQUE (id, organization_id)).
-- assigned_user_id is nullable; application layer verifies membership when set.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPE
-- ---------------------------------------------------------------------------

CREATE TYPE public.appointment_status AS ENUM (
  'scheduled',
  'completed',
  'cancelled'
);


-- ---------------------------------------------------------------------------
-- 2. TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.appointments (
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

  starts_at         TIMESTAMPTZ                       NOT NULL,

  ends_at           TIMESTAMPTZ,

  status            public.appointment_status         NOT NULL DEFAULT 'scheduled',

  location          TEXT
                                                        CHECK (
                                                          location IS NULL
                                                          OR char_length(location) BETWEEN 1 AND 500
                                                        ),

  notes             TEXT
                                                        CHECK (
                                                          notes IS NULL
                                                          OR char_length(notes) BETWEEN 1 AND 2000
                                                        ),

  created_at        TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ                       NOT NULL DEFAULT NOW(),

  CONSTRAINT appointments_ends_after_starts_chk
    CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG GUARD FOR appointment.lead_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_appointment_lead_same_org()
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

REVOKE ALL ON FUNCTION public.enforce_appointment_lead_same_org() FROM PUBLIC;

CREATE TRIGGER appointments_lead_same_org
  BEFORE INSERT OR UPDATE OF lead_id, organization_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_appointment_lead_same_org();


-- ---------------------------------------------------------------------------
-- 4. INDEXES
--
-- Access patterns:
--   a) Lead timeline:     (organization_id, lead_id, starts_at)
--   b) Org queue:         (organization_id, starts_at)
--   c) Status queue:      (organization_id, status, starts_at)
--   d) Assignee queue:    (organization_id, assigned_user_id, status, starts_at)
-- ---------------------------------------------------------------------------

CREATE INDEX appointments_org_lead_starts_idx
  ON public.appointments (organization_id, lead_id, starts_at);

CREATE INDEX appointments_org_starts_idx
  ON public.appointments (organization_id, starts_at);

CREATE INDEX appointments_org_status_starts_idx
  ON public.appointments (organization_id, status, starts_at);

CREATE INDEX appointments_org_assignee_status_starts_idx
  ON public.appointments (organization_id, assigned_user_id, status, starts_at);


-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--
-- SELECT / INSERT / UPDATE — any organization member.
-- DELETE — intentionally absent. Lifecycle is complete / cancel, not delete.
-- ---------------------------------------------------------------------------

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "appointments: members can select"
  ON public.appointments
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

CREATE POLICY "appointments: members can insert"
  ON public.appointments
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

CREATE POLICY "appointments: members can update"
  ON public.appointments
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  )
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );
