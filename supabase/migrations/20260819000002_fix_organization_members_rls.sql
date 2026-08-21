-- =============================================================================
-- Migration: Fix organization_members RLS infinite recursion
-- Created:   2026-08-19
-- Depends-on: 20260819000001_foundation.sql
--
-- ROOT CAUSE
-- ----------
-- Every RLS policy on organization_members contained a self-referential
-- subquery:
--
--   USING (
--     organization_id IN (
--       SELECT organization_id
--       FROM public.organization_members   <-- same table
--       WHERE user_id = auth.uid()
--     )
--   )
--
-- When PostgreSQL evaluates the policy for any query on this table, it must
-- first run the subquery — but the subquery reads the same table, which
-- triggers the same policy, which needs the subquery ... infinite recursion.
--
-- The organizations table policies shared the same indirect recursion path:
-- they queried organization_members, whose own SELECT policy was recursive.
--
-- FIX
-- ---
-- 1. Introduce a narrowly-scoped SECURITY DEFINER function
--    public.auth_user_role_in_org(p_organization_id).
--    It queries organization_members while bypassing the table's RLS
--    (SECURITY DEFINER executes as the function owner, which is postgres),
--    breaking the cycle.
--    The function accepts ONLY the organization_id — auth.uid() is always
--    the user, never a parameter — so callers cannot probe other users.
--
-- 2. Drop and recreate all four policies on organization_members.
--
-- 3. Drop and recreate the two affected policies on organizations.
--
-- SECURITY GUARANTEES PRESERVED
-- ------------------------------
-- - Tenant isolation: a user can only see / write rows whose organization_id
--   maps to an org they are a member of (auth_user_role_in_org returns NULL
--   for orgs they do not belong to).
-- - RLS remains enabled on both tables; no bypass in normal query paths.
-- - No service-role key used for authenticated user queries.
-- - Owner/admin authorization enforced on writes.
-- - Cross-tenant read/write blocked by function returning NULL for non-members.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER helper: returns the calling user's role in an org.
--
--    Called only from RLS policies; always uses auth.uid() as the subject.
--    No p_user_id parameter → callers cannot probe other users' roles.
--    SECURITY DEFINER → runs as postgres, bypassing organization_members RLS.
--    SET search_path = public → prevents search_path injection attacks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_role_in_org(p_organization_id UUID)
RETURNS public.member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Restrict to authenticated sessions and the service role only.
-- Prevents anonymous callers from probing membership.
REVOKE ALL ON FUNCTION public.auth_user_role_in_org(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_role_in_org(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_role_in_org(UUID) TO service_role;

-- Tighten permissions on the existing helper functions introduced in migration
-- 000001.  They accept an arbitrary p_user_id parameter, creating an
-- information-disclosure path where any authenticated user could probe whether
-- a known UUID is a member of a known org.  Revoke PUBLIC execute; callers
-- that legitimately need these helpers already run as service_role or postgres.
REVOKE ALL ON FUNCTION public.is_org_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_org_role(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_role(UUID, UUID) TO service_role;


-- ---------------------------------------------------------------------------
-- 2. Drop the four recursive policies on organization_members
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "organization_members: members can select own org"
  ON public.organization_members;

DROP POLICY IF EXISTS "organization_members: owners and admins can insert"
  ON public.organization_members;

DROP POLICY IF EXISTS "organization_members: owners and admins can update"
  ON public.organization_members;

DROP POLICY IF EXISTS "organization_members: owners and admins can delete"
  ON public.organization_members;


-- ---------------------------------------------------------------------------
-- 3. Recreate organization_members policies — non-recursive
--
--    auth_user_role_in_org(organization_id) returns:
--      'owner' | 'admin' | 'agent'  → user is a member (and has that role)
--      NULL                         → user is NOT a member → access denied
-- ---------------------------------------------------------------------------

-- SELECT: any member can see all membership rows for their own organization.
CREATE POLICY "organization_members: members can select own org"
  ON public.organization_members
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- INSERT: only owners and admins may add new members.
CREATE POLICY "organization_members: owners and admins can insert"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );

-- UPDATE: only owners and admins may change existing member records.
CREATE POLICY "organization_members: owners and admins can update"
  ON public.organization_members
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );

-- DELETE: only owners and admins may remove members.
CREATE POLICY "organization_members: owners and admins can delete"
  ON public.organization_members
  FOR DELETE
  USING (
    public.auth_user_role_in_org(organization_id) IN ('owner', 'admin')
  );


-- ---------------------------------------------------------------------------
-- 4. Fix the organizations policies that queried organization_members
--    The indirect recursion path:
--      organizations policy → subquery on organization_members
--      → organization_members SELECT policy → subquery on organization_members
--      → ...
--    Now resolved because auth_user_role_in_org bypasses org_members RLS.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "organizations: members can select"
  ON public.organizations;

DROP POLICY IF EXISTS "organizations: owners and admins can update"
  ON public.organizations;

-- SELECT: any member may read their organization row (soft-delete aware).
CREATE POLICY "organizations: members can select"
  ON public.organizations
  FOR SELECT
  USING (
    public.auth_user_role_in_org(id) IS NOT NULL
    AND deleted_at IS NULL
  );

-- UPDATE: only owners and admins may change organization metadata.
CREATE POLICY "organizations: owners and admins can update"
  ON public.organizations
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(id) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.auth_user_role_in_org(id) IN ('owner', 'admin')
  );
