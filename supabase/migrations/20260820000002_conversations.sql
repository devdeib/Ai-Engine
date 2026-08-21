-- =============================================================================
-- Migration: Conversations and messages
-- Created:   2026-08-20
-- Depends-on: 20260820000001_lead_activities.sql
--
-- PURPOSE
-- -------
-- Establishes the conversation thread substrate for CRM sales operations.
-- Conversations are communication threads attached to a lead.
-- Messages are individual append-only entries inside a conversation.
--
-- CONCEPTUAL SEPARATION
-- ---------------------
-- lead_activities  = CRM event timeline (notes, calls, status changes)
-- conversations    = communication threads
-- messages         = utterances inside a thread
--
-- Do NOT store chat bodies in lead_activities.
--
-- SCHEMA DECISIONS
-- ----------------
-- channel          ENUM, Phase 3 supports only 'in_app'.
-- status           ENUM open | closed — no extra pipeline states.
-- requires_human   BOOLEAN NOT NULL DEFAULT false — Phase 4 handoff flag.
--                  No AI behaviour in this migration.
-- ai_paused_at     TIMESTAMPTZ NULL — Phase 4 pause marker. Unused in Phase 3.
-- author_user_id   NULL FK — human author when present; NULL reserved for
--                  future system/AI messages so they never impersonate a user.
-- direction        inbound | outbound. Phase 3 outbound = human operator.
-- body             bounded plain text. No provider IDs, no delivery status.
-- messages         append-only: created_at only; no UPDATE/DELETE policies.
--
-- TENANT INTEGRITY
-- ----------------
-- lead_id → leads(id) ON DELETE CASCADE (ordinary FK; leads.id is already PK).
-- Same-organization match is enforced by trigger
--   enforce_conversation_lead_same_org() rather than ALTER TABLE leads ADD
--   UNIQUE (id, organization_id). Adding that unique constraint requires an
--   ACCESS EXCLUSIVE lock on the live leads table and deadlocks under
--   concurrent CRM traffic.
-- messages use a composite FK (conversation_id, organization_id) onto the
-- new conversations table — no lock on existing tables.
-- A unique partial index enforces one open in_app conversation per lead.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE public.conversation_channel AS ENUM (
  'in_app'
);

CREATE TYPE public.conversation_status AS ENUM (
  'open',
  'closed'
);

CREATE TYPE public.message_direction AS ENUM (
  'inbound',
  'outbound'
);


-- ---------------------------------------------------------------------------
-- 2. CONVERSATIONS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.conversations (
  id              UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID                            NOT NULL
                                                    REFERENCES public.organizations(id)
                                                    ON DELETE CASCADE,

  lead_id         UUID                            NOT NULL
                                                    REFERENCES public.leads(id)
                                                    ON DELETE CASCADE,

  channel         public.conversation_channel     NOT NULL DEFAULT 'in_app',
  status          public.conversation_status      NOT NULL DEFAULT 'open',

  -- Phase 4 handoff foundation. No AI behaviour in this migration.
  requires_human  BOOLEAN                         NOT NULL DEFAULT false,
  ai_paused_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),

  -- Supports messages FK (conversation_id, organization_id).
  CONSTRAINT conversations_id_organization_id_key
    UNIQUE (id, organization_id)
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ---------------------------------------------------------------------------
-- 3. SAME-ORG GUARD FOR conversation.lead_id
--    SECURITY DEFINER so the check is not affected by RLS on leads.
--    Does not return lead data; only accepts or rejects the write.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_conversation_lead_same_org()
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

REVOKE ALL ON FUNCTION public.enforce_conversation_lead_same_org() FROM PUBLIC;

CREATE TRIGGER conversations_lead_same_org
  BEFORE INSERT OR UPDATE OF lead_id, organization_id
  ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_conversation_lead_same_org();


-- ---------------------------------------------------------------------------
-- 4. MESSAGES TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE public.messages (
  id                UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id   UUID                        NOT NULL
                                                  REFERENCES public.organizations(id)
                                                  ON DELETE CASCADE,

  conversation_id   UUID                        NOT NULL,

  -- Nullable: human author when present; NULL for future system/AI messages.
  author_user_id    UUID
                                                  REFERENCES auth.users(id)
                                                  ON DELETE SET NULL,

  direction         public.message_direction    NOT NULL,
  body              TEXT                        NOT NULL
                                                  CHECK (char_length(body) BETWEEN 1 AND 4000),

  -- Immutable timestamp — messages are append-only.
  created_at        TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

  -- Tenant-safe parent: the conversation must belong to the same organization.
  CONSTRAINT messages_conversation_org_fk
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.conversations (id, organization_id)
    ON DELETE CASCADE
);


-- ---------------------------------------------------------------------------
-- 5. INDEXES
--
-- Access patterns:
--   a) Org inbox ordered by recency: (organization_id, updated_at DESC)
--   b) Conversations for a lead:     (organization_id, lead_id)
--   c) Thread messages newest-first: (organization_id, conversation_id, created_at DESC)
-- ---------------------------------------------------------------------------

CREATE INDEX conversations_org_updated_idx
  ON public.conversations (organization_id, updated_at DESC);

CREATE INDEX conversations_org_lead_idx
  ON public.conversations (organization_id, lead_id);

-- One open in-app conversation per lead. Closed threads may accumulate.
CREATE UNIQUE INDEX conversations_one_open_in_app_per_lead
  ON public.conversations (organization_id, lead_id)
  WHERE channel = 'in_app' AND status = 'open';

CREATE INDEX messages_org_conversation_created_idx
  ON public.messages (organization_id, conversation_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--
-- Uses auth_user_role_in_org(organization_id) — SECURITY DEFINER helper from
-- migration 000002.  Always scoped to auth.uid(). Never self-referential.
--
-- conversations:
--   SELECT / INSERT / UPDATE — any org member
--   DELETE — intentionally absent
-- messages:
--   SELECT / INSERT — any org member
--   UPDATE / DELETE — intentionally absent (append-only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- conversations SELECT
CREATE POLICY "conversations: members can select"
  ON public.conversations
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- conversations INSERT
CREATE POLICY "conversations: members can insert"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- conversations UPDATE — dual check prevents moving a thread across orgs
CREATE POLICY "conversations: members can update"
  ON public.conversations
  FOR UPDATE
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  )
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- messages SELECT
CREATE POLICY "messages: members can select"
  ON public.messages
  FOR SELECT
  USING (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );

-- messages INSERT
CREATE POLICY "messages: members can insert"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    public.auth_user_role_in_org(organization_id) IS NOT NULL
  );
