-- =============================================================================
-- Migration: SMS channel enum (Phase 5.4A)
-- Created:   2026-08-28
-- Depends-on: 20260827000006_email_channel.sql
--
-- PURPOSE
-- -------
-- Add SMS as the third real external provider behind the existing
-- generic channel substrate. Text-only Telnyx contract is locked in 5.4A.
-- Live Telnyx send/receive HTTP and Ed25519 verification are Phase 5.4B.
--
-- Additive enum values only. No new tables, no RLS changes, no secret-column
-- changes. Existing in_app, test, whatsapp, and email rows remain valid.
-- conversations_channel_scope_chk and conversations_one_open_external_per_identity
-- already apply to any channel <> 'in_app'.
--
-- Secrets reuse channel_account_secrets:
--   webhook_secret          Telnyx Ed25519 public key
--   provider_access_token   Telnyx API key
--   webhook_verify_token    unused for SMS (WhatsApp GET challenge only)
-- =============================================================================

ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'sms';
ALTER TYPE public.channel_kind ADD VALUE IF NOT EXISTS 'sms';
