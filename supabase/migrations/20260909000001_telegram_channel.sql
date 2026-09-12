-- =============================================================================
-- Migration: Telegram Bot API channel (Phase 5.2)
-- Created:   2026-09-09
-- Depends-on: 20260828000001_sms_channel.sql
--
-- PURPOSE
-- -------
-- Add Telegram as a real external provider behind the existing generic
-- channel substrate. Text-only Bot API contract (inbound webhook +
-- sendMessage). Additive enum values only. No new tables, no RLS changes,
-- no secret-column changes. Existing in_app, test, whatsapp, email, and
-- sms rows remain valid.
-- conversations_channel_scope_chk and conversations_one_open_external_per_identity
-- already apply to any channel <> 'in_app'.
--
-- Secrets reuse channel_account_secrets:
--   webhook_secret          Telegram webhook secret_token (NOT the bot token)
--                           Header: X-Telegram-Bot-Api-Secret-Token
--   provider_access_token   Telegram Bot Token
--   webhook_verify_token    unused for Telegram (WhatsApp GET challenge only)
-- =============================================================================

ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'telegram';
ALTER TYPE public.channel_kind ADD VALUE IF NOT EXISTS 'telegram';
