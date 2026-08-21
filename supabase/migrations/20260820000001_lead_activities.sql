-- =============================================================================
-- Migration: Lead Activities timeline
-- Created:   2026-08-20
-- Depends-on: 20260819000003_leads.sql
--
-- PURPOSE
-- -------
-- Establishes an append-only activity timeline for leads.
-- Each row records a CRM interaction or event tied to a specific lead.
--
-- SCHEMA DECISIONS
-- ----------------
-- user_id      NULL FK  — records survive team-member removal (ON DELETE SET NULL).
--                         NULL is also valid for future system-generated events.
-- type         ENUM     — bounded set prevents unbounded record types at the DB layer.
-- content      TEXT     — bounded to 2000 chars; plain text only at MVP.
-- created_at   ONLY     — no updated_at: activities are immutable once written.
--                         Append-only design; no UPDATE or DELETE policies.
-- metadata     ABSENT   — not needed at MVP; add if a concrete use-case justifies it.
-- deleted_at   ABSENT   — no soft-delete; the timeline is the source of truth.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPE
-- ---------------------------------------------------------------------------

CREATE TYPE public.lead_activity_type AS ENUM (
  'note',
  'call',
  'email',
  'meeting',
  'status_change'
);


-- ---------------------------------------------------------------------------
-- 2. TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.lead_activities (
  id              UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scoping — every activity belongs to exactly one organization.
  organization_id UUID                          NOT NULL
                                                  REFERENCES public.organizations(id)
                                                  ON DELETE CASCADE,

  -- Parent lead — activity is deleted when the lead is deleted.
  lead_id         UUID                          NOT NULL
                                                  REFERENCES public.leads(id)
                                                  ON DELETE CASCADE,

  -- Nullable: row survives team-member deletion.
  user_id         UUID
                                                  REFERENCES auth.users(id)
                                                  ON DELETE SET NULL,

  -- Classification — DB-constrained enum.
  type            public.lead_activity_type     NOT NULL,

  -- Human-readable record of the event.  Bounded to prevent unbounded growth.
  content         TEXT                          NOT NULL
                                                  CHECK (char_length(content) BETWEEN 1 AND 2000),

  -- Immutable timestamp — no updated_at because activities cannot be edited.
  created_at      TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 3. INDEXES
--
-- Primary access pattern: "show all activities for this lead ordered by time."
-- Secondary access pattern: "show all recent activity for this organization."
-- ---------------------------------------------------------------------------

-- Timeline view per lead — the primary query path.
CREATE INDEX lead_activities_org_lead_created_idx
  ON public.lead_activities (organization_id, lead_id, created_at DESC);

-- Organization-wide recency queries (potential future dashboard widget).
CREATE INDEX lead_activities_org_created_idx
  ON public.lead_activities (organization_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--
-- Uses auth_user_role_in_org(organization_id) — the SECURITY DEFINER function
-- introduced in migration 000002.  It queries organization_members without
-- triggering that table's own RLS (avoids recursion), and is always scoped
-- to auth.uid().
--
-- Policy matrix:
-- SELECT — any organization member may read activities in their org.
-- INSERT — any organization member may add an activity.
-- UPDATE — intentionally absent: the timeline is append-only.
-- DELETE — intentionally absent: activities are immutable records.
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "lead_activities: members can select"
  ON public.lead_activities
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- INSERT
CREATE POLICY "lead_activities: members can insert"
  ON public.lead_activities
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );
