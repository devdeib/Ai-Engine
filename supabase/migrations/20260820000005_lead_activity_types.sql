-- =============================================================================
-- Migration: Lead activity types for CRM event wiring
-- Created:   2026-08-20
-- Depends-on: 20260820000004_appointments.sql
--
-- PURPOSE
-- -------
-- Extends lead_activity_type so the timeline can honestly record human CRM
-- events from conversations, follow-ups, and appointments.
--
-- Existing values are preserved:
--   note, call, email, meeting, status_change
--
-- New values (Phase 3.6):
--   conversation  — conversation started / in-app message sent or received
--   follow_up     — follow-up created / completed / cancelled
--   appointment   — appointment scheduled / completed / cancelled
--
-- These are not interchangeable with email, call, or meeting: an in-app
-- message is not an email, and a follow-up is not a lead status_change.
-- =============================================================================

ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'conversation';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'appointment';
