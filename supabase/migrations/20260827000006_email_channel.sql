-- =============================================================================
-- Migration: Email channel enum (Phase 5.3A)
-- Created:   2026-08-27
-- Depends-on: 20260827000005_whatsapp_channel.sql
--
-- PURPOSE
-- -------
-- Add Email as the second real external provider behind the existing
-- generic channel substrate. Text-only contract is locked in 5.3A.
-- Live Resend send/receive HTTP is Phase 5.3B.
--
-- Additive enum values only. No new tables, no RLS changes, no secret-column
-- changes. Existing in_app, test, and whatsapp rows remain valid.
-- conversations_channel_scope_chk and conversations_one_open_external_per_identity
-- already apply to any channel <> 'in_app'.
--
-- Secrets reuse channel_account_secrets:
--   webhook_secret          Resend/Svix webhook signing secret (whsec_...)
--   provider_access_token   Resend API key (re_...) — not webhook_secret
--   webhook_verify_token    unused for Email (WhatsApp GET challenge only)
-- =============================================================================

ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE public.channel_kind ADD VALUE IF NOT EXISTS 'email';
