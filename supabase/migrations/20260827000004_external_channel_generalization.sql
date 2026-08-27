-- =============================================================================
-- Migration: External-channel generalization (Phase 5.2A)
-- Created:   2026-08-27
-- Depends-on: 20260827000003_channel_reliability.sql
--
-- PURPOSE
-- -------
-- Treat any non-in_app conversation as an external channel without adding
-- provider enum values. Test rows remain valid. No RLS changes.
--
-- Existing data: in_app rows still have null FKs; test rows still have both
-- FKs set. The generalized CHECK and unique index accept those rows.
-- =============================================================================

ALTER TABLE public.conversations
  DROP CONSTRAINT conversations_channel_scope_chk;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_channel_scope_chk
  CHECK (
    (channel = 'in_app'
      AND channel_account_id IS NULL
      AND channel_identity_id IS NULL)
    OR
    (channel <> 'in_app'
      AND channel_account_id IS NOT NULL
      AND channel_identity_id IS NOT NULL)
  );

DROP INDEX public.conversations_one_open_external_per_identity;

CREATE UNIQUE INDEX conversations_one_open_external_per_identity
  ON public.conversations (organization_id, lead_id, channel_identity_id)
  WHERE channel <> 'in_app' AND status = 'open' AND channel_identity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.persist_channel_inbound(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_channel_account_id uuid,
  p_channel_identity_id uuid,
  p_provider_message_id text,
  p_body text
)
RETURNS TABLE (
  message_id uuid,
  conversation_id uuid,
  channel_identity_id uuid,
  created boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  existing_message_id uuid;
  existing_conversation_id uuid;
  existing_identity_id uuid;
  new_message_id uuid;
BEGIN
  IF p_body IS NULL OR char_length(p_body) < 1 OR char_length(p_body) > 4000 THEN
    RAISE EXCEPTION 'inbound body is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations AS c
    WHERE c.id = p_conversation_id
      AND c.organization_id = p_organization_id
      AND c.channel <> 'in_app'
      AND c.channel_account_id = p_channel_account_id
      AND c.channel_identity_id = p_channel_identity_id
  ) THEN
    RAISE EXCEPTION 'conversation does not match inbound channel scope'
      USING ERRCODE = '23503';
  END IF;

  SELECT
    r.message_id,
    m.conversation_id,
    r.channel_identity_id
  INTO
    existing_message_id,
    existing_conversation_id,
    existing_identity_id
  FROM public.channel_message_refs AS r
  INNER JOIN public.messages AS m
    ON m.id = r.message_id
   AND m.organization_id = r.organization_id
  WHERE r.channel_account_id = p_channel_account_id
    AND r.provider_message_id = p_provider_message_id
    AND r.direction = 'inbound'
    AND r.organization_id = p_organization_id;

  IF existing_message_id IS NOT NULL THEN
    message_id := existing_message_id;
    conversation_id := existing_conversation_id;
    channel_identity_id := existing_identity_id;
    created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.messages (
      organization_id,
      conversation_id,
      author_user_id,
      author_type,
      channel_identity_id,
      direction,
      body
    )
    VALUES (
      p_organization_id,
      p_conversation_id,
      NULL,
      'customer',
      p_channel_identity_id,
      'inbound',
      p_body
    )
    RETURNING id INTO new_message_id;

    INSERT INTO public.channel_message_refs (
      organization_id,
      message_id,
      channel_account_id,
      channel_identity_id,
      direction,
      provider_message_id,
      delivery_status
    )
    VALUES (
      p_organization_id,
      new_message_id,
      p_channel_account_id,
      p_channel_identity_id,
      'inbound',
      p_provider_message_id,
      'not_applicable'
    );

    UPDATE public.conversations
    SET updated_at = NOW()
    WHERE id = p_conversation_id
      AND organization_id = p_organization_id;

    message_id := new_message_id;
    conversation_id := p_conversation_id;
    channel_identity_id := p_channel_identity_id;
    created := true;
    RETURN NEXT;
    RETURN;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT
        r.message_id,
        m.conversation_id,
        r.channel_identity_id
      INTO
        existing_message_id,
        existing_conversation_id,
        existing_identity_id
      FROM public.channel_message_refs AS r
      INNER JOIN public.messages AS m
        ON m.id = r.message_id
       AND m.organization_id = r.organization_id
      WHERE r.channel_account_id = p_channel_account_id
        AND r.provider_message_id = p_provider_message_id
        AND r.direction = 'inbound'
        AND r.organization_id = p_organization_id;

      IF existing_message_id IS NULL THEN
        RAISE;
      END IF;

      message_id := existing_message_id;
      conversation_id := existing_conversation_id;
      channel_identity_id := existing_identity_id;
      created := false;
      RETURN NEXT;
      RETURN;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_channel_inbound(uuid, uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_channel_inbound(uuid, uuid, uuid, uuid, text, text) TO service_role;
