-- =============================================================================
-- Migration: Organization sales profiles (Phase 6)
-- Created:   2026-08-31
-- Depends-on: 20260819000002_fix_organization_members_rls.sql
--
-- PURPOSE
-- -------
-- One tenant-scoped sales profile per organization. Bounded text fields the
-- AI may treat as trusted company configuration. Not a knowledge base, RAG
-- store, document table, or custom system-prompt field.
--
-- RLS
-- ---
-- SELECT: any organization member
-- INSERT / UPDATE: owner or admin
-- No DELETE policy (empty profile is PATCH with nulls)
-- =============================================================================

CREATE TABLE public.organization_sales_profiles (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID        NOT NULL
                                         REFERENCES public.organizations (id)
                                         ON DELETE CASCADE,
  offering_summary         TEXT        CHECK (
                                         offering_summary IS NULL
                                         OR char_length(offering_summary) <= 2000
                                       ),
  service_area             TEXT        CHECK (
                                         service_area IS NULL
                                         OR char_length(service_area) <= 1000
                                       ),
  qualification_criteria   TEXT        CHECK (
                                         qualification_criteria IS NULL
                                         OR char_length(qualification_criteria) <= 2000
                                       ),
  constraints              TEXT        CHECK (
                                         constraints IS NULL
                                         OR char_length(constraints) <= 2000
                                       ),
  typical_next_step        TEXT        CHECK (
                                         typical_next_step IS NULL
                                         OR char_length(typical_next_step) <= 500
                                       ),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT organization_sales_profiles_organization_id_key
    UNIQUE (organization_id)
);

CREATE INDEX organization_sales_profiles_organization_id_idx
  ON public.organization_sales_profiles (organization_id);

CREATE TRIGGER organization_sales_profiles_updated_at
  BEFORE UPDATE ON public.organization_sales_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.organization_sales_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_sales_profiles: members can select"
  ON public.organization_sales_profiles
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

CREATE POLICY "organization_sales_profiles: owners and admins can insert"
  ON public.organization_sales_profiles
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );

CREATE POLICY "organization_sales_profiles: owners and admins can update"
  ON public.organization_sales_profiles
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );
