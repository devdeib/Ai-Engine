-- =============================================================================
-- Migration: CRM Leads table
-- Created:   2026-08-19
-- Depends-on: 20260819000002_fix_organization_members_rls.sql
--
-- Establishes the leads table as the first CRM entity.
-- Every lead is scoped to exactly one organization (multi-tenant isolation).
-- RLS is enforced via auth_user_role_in_org() introduced in migration 000002,
-- which breaks the recursion problem that plagued the original policies.
--
-- SCHEMA DECISIONS
-- ----------------
-- email         TEXT NULL      — nullable; the system is channel-agnostic.
--                                A lead may arrive via WhatsApp, phone, or
--                                referral with no email at all.  When a value
--                                IS provided it must pass the format check.
-- phone         nullable       — often unknown at initial capture.
-- company_name  nullable       — B2C / individual leads have no company.
-- source        ENUM NOT NULL  — bounded set; DB constraint beats app-only check.
-- status        ENUM NOT NULL  — same; default 'new' for every fresh lead.
-- score         SMALLINT 0-100 — nullable (NULL = not yet scored).
-- notes         TEXT nullable  — no length cap; sales notes can be verbose.
-- owner_id      nullable FK    — ON DELETE SET NULL so leads survive when a
--                                team member is removed.
-- deleted_at    NOT included   — soft delete adds complexity not needed at MVP;
--                                hard delete with owner/admin guard is sufficient.
-- No UNIQUE on email           — the same email may appear as a lead across
--                                different orgs (expected in multi-tenant CRM),
--                                and duplicate capture within an org is a
--                                business-layer deduplication concern for 2.x.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.lead_source AS ENUM (
  'website',
  'referral',
  'cold_call',
  'email_campaign',
  'social_media',
  'portal',
  'other'
);

CREATE TYPE public.lead_status AS ENUM (
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'lost',
  'converted'
);


-- ---------------------------------------------------------------------------
-- 2. LEADS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.leads (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant ownership — every lead belongs to exactly one organization.
  organization_id UUID               NOT NULL
                                       REFERENCES public.organizations(id)
                                       ON DELETE CASCADE,

  -- Optional assignment to a team member.
  owner_id        UUID
                                       REFERENCES auth.users(id)
                                       ON DELETE SET NULL,

  -- Core identity
  first_name      TEXT               NOT NULL
                                       CHECK (char_length(first_name) BETWEEN 1 AND 100),
  last_name       TEXT               NOT NULL
                                       CHECK (char_length(last_name) BETWEEN 1 AND 100),
  email           TEXT               CHECK (
                                       email IS NULL
                                       OR (
                                         char_length(email) <= 255
                                         AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
                                       )
                                     ),
  phone           TEXT               CHECK (phone IS NULL OR char_length(phone) <= 30),
  company_name    TEXT               CHECK (
                                       company_name IS NULL
                                       OR char_length(company_name) BETWEEN 1 AND 255
                                     ),

  -- Classification
  source          public.lead_source NOT NULL DEFAULT 'other',
  status          public.lead_status NOT NULL DEFAULT 'new',
  score           SMALLINT           CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

  -- Freeform
  notes           TEXT,

  -- Audit timestamps
  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- 3. UPDATED-AT TRIGGER
--    Reuses the handle_updated_at() function defined in migration 000001.
-- ---------------------------------------------------------------------------

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 4. INDEXES
--    Justified by current query patterns:
--    a) All lead queries filter by organization_id first.
--    b) Status-based list views (e.g. "show all new leads") are the primary UI.
--    c) "My leads" / owner-assignment views are common in a CRM.
-- ---------------------------------------------------------------------------

-- Base tenant filter — every query hits this.
CREATE INDEX leads_organization_id_idx
  ON public.leads (organization_id);

-- Status list views within a tenant.
CREATE INDEX leads_org_status_idx
  ON public.leads (organization_id, status);

-- Owner / assignment views within a tenant.
CREATE INDEX leads_org_owner_idx
  ON public.leads (organization_id, owner_id);


-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--    Uses auth_user_role_in_org(organization_id) — the SECURITY DEFINER
--    function introduced in migration 000002.  It queries organization_members
--    without triggering the table's own RLS (avoids recursion), and is always
--    scoped to auth.uid().
--
--    Policy matrix:
--    SELECT  — any member can see all leads belonging to their organizations.
--    INSERT  — any member can capture a lead into their organization.
--              The WITH CHECK ensures the organization_id on the new row is
--              one the user actually belongs to (not client-supplied trust).
--    UPDATE  — any member can edit leads in their organization.
--              Both USING and WITH CHECK prevent moving a lead across orgs.
--    DELETE  — only owners and admins can permanently remove leads.
-- ---------------------------------------------------------------------------

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- SELECT
CREATE POLICY "leads: members can select"
  ON public.leads
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- INSERT
CREATE POLICY "leads: members can insert"
  ON public.leads
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- UPDATE — dual check prevents cross-tenant move
CREATE POLICY "leads: members can update"
  ON public.leads
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  )
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- DELETE — elevated privilege required
CREATE POLICY "leads: owners and admins can delete"
  ON public.leads
  FOR DELETE
  USING (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );
