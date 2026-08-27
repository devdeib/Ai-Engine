-- =============================================================================
-- Migration: WhatsApp Cloud API channel (Phase 5.2B)
-- Created:   2026-08-27
-- Depends-on: 20260827000004_external_channel_generalization.sql
--
-- PURPOSE
-- -------
-- Add WhatsApp as the first real external provider behind the existing
-- generic channel substrate. Text-only. Additive enum values and nullable
-- secret columns only. No RLS changes. Existing in_app and test rows remain
-- valid. webhook_secret CHECK (32–128) is unchanged and is NOT applied to
-- the Graph access token.
--
-- Secrets:
--   webhook_secret          Meta App Secret (HMAC key for X-Hub-Signature-256)
--   webhook_verify_token    GET hub.verify_token
--   provider_access_token   Graph API Bearer token (no 32–128 length CHECK)
-- =============================================================================

ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'whatsapp';
ALTER TYPE public.channel_kind ADD VALUE IF NOT EXISTS 'whatsapp';

ALTER TABLE public.channel_account_secrets
  ADD COLUMN IF NOT EXISTS provider_access_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT NULL;

ALTER TABLE public.channel_account_secrets
  DROP CONSTRAINT IF EXISTS channel_account_secrets_provider_access_token_len_chk;

ALTER TABLE public.channel_account_secrets
  ADD CONSTRAINT channel_account_secrets_provider_access_token_len_chk
  CHECK (
    provider_access_token IS NULL
    OR char_length(provider_access_token) BETWEEN 1 AND 4096
  );

ALTER TABLE public.channel_account_secrets
  DROP CONSTRAINT IF EXISTS channel_account_secrets_webhook_verify_token_len_chk;

ALTER TABLE public.channel_account_secrets
  ADD CONSTRAINT channel_account_secrets_webhook_verify_token_len_chk
  CHECK (
    webhook_verify_token IS NULL
    OR char_length(webhook_verify_token) BETWEEN 1 AND 256
  );
