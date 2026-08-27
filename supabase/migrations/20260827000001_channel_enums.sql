-- =============================================================================
-- Migration: Channel substrate enums (Phase 5.1)
-- Created:   2026-08-27
-- Depends-on: 20260822000004_ai_sales_recommendations.sql
--
-- PURPOSE
-- -------
-- Adds enum values required by the channel substrate in a separate
-- transaction from the tables that use them (PostgreSQL restriction).
--
-- conversation_channel: in_app (existing) + test (Phase 5.1 only).
-- message_author_type:  human | ai | system (existing) + customer.
-- =============================================================================

ALTER TYPE public.conversation_channel ADD VALUE IF NOT EXISTS 'test';

ALTER TYPE public.message_author_type ADD VALUE IF NOT EXISTS 'customer';
