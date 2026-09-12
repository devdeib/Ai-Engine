-- =============================================================================
-- Migration: Lead qualification facts (Phase 7 P0)
-- Created:   2026-09-12
-- Depends-on: 20260822000002_ai_tool_actions.sql
--             20260819000003_leads.sql
--
-- PURPOSE
-- -------
-- Durable, allowlisted customer-stated qualification facts on leads.
-- Qualification status is derived in application code — not stored.
--
-- Also expands ai_tool_actions so record_customer_facts can use the existing
-- write ledger. create_follow_up and create_appointment remain valid.
-- =============================================================================

ALTER TABLE public.leads
  ADD COLUMN qualification_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN qualification_updated_at TIMESTAMPTZ NULL;

ALTER TABLE public.ai_tool_actions
  DROP CONSTRAINT IF EXISTS ai_tool_actions_tool_name_check;

ALTER TABLE public.ai_tool_actions
  ADD CONSTRAINT ai_tool_actions_tool_name_check
  CHECK (tool_name IN (
    'create_follow_up',
    'create_appointment',
    'record_customer_facts'
  ));

ALTER TABLE public.ai_tool_actions
  DROP CONSTRAINT IF EXISTS ai_tool_actions_result_resource_type_check;

ALTER TABLE public.ai_tool_actions
  ADD CONSTRAINT ai_tool_actions_result_resource_type_check
  CHECK (
    result_resource_type IS NULL
    OR result_resource_type IN (
      'lead_follow_up',
      'appointment',
      'lead'
    )
  );
