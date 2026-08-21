-- =============================================================================
-- Migration: AI message authorship, idempotency, and activity type
-- Created:   2026-08-21
-- Depends-on: 20260820000005_lead_activity_types.sql
--
-- PURPOSE
-- -------
-- Phase 4 foundation:
--   1. Distinguish human vs AI vs system message authors without fake auth.users.
--   2. Database-enforced idempotency for AI replies (one outbound per inbound).
--   3. Honest CRM activity type for AI-generated events.
--
-- Messages remain append-only (no UPDATE/DELETE policies).
-- Processed inbound messages cannot be flagged in-place; instead an AI outbound
-- row points at the inbound via in_reply_to_message_id, unique per org.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. MESSAGE AUTHOR TYPE
-- ---------------------------------------------------------------------------

CREATE TYPE public.message_author_type AS ENUM (
  'human',
  'ai',
  'system'
);

ALTER TABLE public.messages
  ADD COLUMN author_type public.message_author_type NOT NULL DEFAULT 'human';

ALTER TABLE public.messages
  ADD COLUMN in_reply_to_message_id UUID;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_author_type_user_chk
  CHECK (
    (author_type = 'human' AND author_user_id IS NOT NULL)
    OR (author_type IN ('ai', 'system') AND author_user_id IS NULL)
  );

-- Composite unique key so replies stay in the same tenant.
ALTER TABLE public.messages
  ADD CONSTRAINT messages_id_organization_id_key
  UNIQUE (id, organization_id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_in_reply_to_org_fk
  FOREIGN KEY (in_reply_to_message_id, organization_id)
  REFERENCES public.messages (id, organization_id)
  ON DELETE SET NULL;

-- One AI (or other) reply per inbound message, per organization.
CREATE UNIQUE INDEX messages_org_in_reply_to_uidx
  ON public.messages (organization_id, in_reply_to_message_id)
  WHERE in_reply_to_message_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 2. ACTIVITY TYPE
-- ---------------------------------------------------------------------------

ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'ai';
