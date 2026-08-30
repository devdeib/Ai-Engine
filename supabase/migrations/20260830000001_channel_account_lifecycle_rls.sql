-- Phase 5.5B: Channel account lifecycle — tighten INSERT/UPDATE to owner/admin.
-- SELECT remains any organization member. Secrets remain without authenticated SELECT.
-- Additive only: no table, enum, index, function, or secret-column changes.

DROP POLICY IF EXISTS "channel_accounts: members can insert" ON public.channel_accounts;
DROP POLICY IF EXISTS "channel_accounts: members can update" ON public.channel_accounts;

CREATE POLICY "channel_accounts: owners and admins can insert"
  ON public.channel_accounts
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IN ('owner', 'admin'));

CREATE POLICY "channel_accounts: owners and admins can update"
  ON public.channel_accounts
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IN ('owner', 'admin'))
  WITH CHECK (public.auth_user_role_in_org(organization_id) IN ('owner', 'admin'));
