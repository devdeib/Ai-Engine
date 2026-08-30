-- Phase 5.6: Operator channel-identity attach to an existing in-org lead.
-- Additive only: identities UPDATE RLS for members + SECURITY INVOKER RPC.
-- SELECT remains any organization member. No INSERT/DELETE policies.
-- Ingest continues to write identities through service-role access.

CREATE POLICY "channel_identities: members can update"
  ON public.channel_identities
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE OR REPLACE FUNCTION public.attach_channel_identity_lead(
  p_organization_id uuid,
  p_channel_identity_id uuid,
  p_lead_id uuid
)
RETURNS SETOF public.channel_identities
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  identity_row public.channel_identities;
  lead_exists boolean;
BEGIN
  SELECT *
    INTO identity_row
    FROM public.channel_identities
   WHERE id = p_channel_identity_id
     AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.leads
     WHERE id = p_lead_id
       AND organization_id = p_organization_id
  ) INTO lead_exists;

  IF NOT lead_exists THEN
    RETURN;
  END IF;

  UPDATE public.channel_identities
     SET lead_id = p_lead_id
   WHERE id = p_channel_identity_id
     AND organization_id = p_organization_id
  RETURNING * INTO identity_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.conversations
     SET lead_id = p_lead_id
   WHERE channel_identity_id = p_channel_identity_id
     AND organization_id = p_organization_id
     AND status = 'open'
     AND channel <> 'in_app';

  RETURN NEXT identity_row;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_channel_identity_lead(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_channel_identity_lead(uuid, uuid, uuid) TO authenticated;
