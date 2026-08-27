-- =============================================================================
-- Migration: AI execution jobs (async queue)
-- Created:   2026-08-22
-- Depends-on: 20260820000006_ai_message_authorship.sql
--
-- PURPOSE
-- -------
-- Durable, tenant-scoped job table so inbound message HTTP requests do not
-- wait on the LLM. Job rows store only trusted identifiers.
-- Claiming is atomic via FOR UPDATE SKIP LOCKED (no SELECT-then-UPDATE race).
-- =============================================================================

CREATE TYPE public.ai_execution_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TABLE public.ai_execution_jobs (
  id                    UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID                            NOT NULL
                                                          REFERENCES public.organizations(id)
                                                          ON DELETE CASCADE,
  conversation_id       UUID                            NOT NULL,
  inbound_message_id    UUID                            NOT NULL,
  requested_by_user_id  UUID                            NOT NULL
                                                          REFERENCES auth.users(id)
                                                          ON DELETE RESTRICT,
  status                public.ai_execution_job_status  NOT NULL DEFAULT 'pending',
  attempt_count         INTEGER                         NOT NULL DEFAULT 0
                                                          CHECK (attempt_count >= 0),
  max_attempts          INTEGER                         NOT NULL DEFAULT 3
                                                          CHECK (max_attempts >= 1 AND max_attempts <= 10),
  available_at          TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  locked_at             TIMESTAMPTZ,
  last_error_code       TEXT,
  created_at            TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,

  CONSTRAINT ai_execution_jobs_conversation_org_fk
    FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.conversations (id, organization_id)
    ON DELETE CASCADE,

  CONSTRAINT ai_execution_jobs_message_org_fk
    FOREIGN KEY (inbound_message_id, organization_id)
    REFERENCES public.messages (id, organization_id)
    ON DELETE CASCADE
);

-- One job per inbound message per tenant. Duplicate enqueue is a no-op.
CREATE UNIQUE INDEX ai_execution_jobs_org_inbound_uidx
  ON public.ai_execution_jobs (organization_id, inbound_message_id);

CREATE INDEX ai_execution_jobs_due_idx
  ON public.ai_execution_jobs (available_at, status, organization_id);

CREATE TRIGGER ai_execution_jobs_updated_at
  BEFORE UPDATE ON public.ai_execution_jobs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.ai_execution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_execution_jobs: members can select"
  ON public.ai_execution_jobs
  FOR SELECT
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_execution_jobs: members can insert"
  ON public.ai_execution_jobs
  FOR INSERT
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

CREATE POLICY "ai_execution_jobs: members can update"
  ON public.ai_execution_jobs
  FOR UPDATE
  USING (public.auth_user_role_in_org(organization_id) IS NOT NULL)
  WITH CHECK (public.auth_user_role_in_org(organization_id) IS NOT NULL);

-- Atomic claim. INVOKER so RLS still scopes member calls to their org.
-- Stale processing rows (lock older than p_lease_seconds) are reclaimable.
CREATE OR REPLACE FUNCTION public.claim_ai_execution_jobs(
  p_limit integer DEFAULT 1,
  p_organization_id uuid DEFAULT NULL,
  p_lease_seconds integer DEFAULT 90
)
RETURNS SETOF public.ai_execution_jobs
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 1;
  END IF;
  IF p_limit > 20 THEN
    p_limit := 20;
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 THEN
    p_lease_seconds := 90;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.ai_execution_jobs AS j
    WHERE (p_organization_id IS NULL OR j.organization_id = p_organization_id)
      AND j.available_at <= NOW()
      AND j.attempt_count < j.max_attempts
      AND (
        j.status = 'pending'
        OR (
          j.status = 'processing'
          AND j.locked_at IS NOT NULL
          AND j.locked_at < NOW() - make_interval(secs => p_lease_seconds)
        )
      )
    ORDER BY j.created_at ASC
    FOR UPDATE OF j SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.ai_execution_jobs AS job
  SET
    status = 'processing',
    locked_at = NOW(),
    attempt_count = job.attempt_count + 1,
    updated_at = NOW()
  FROM due
  WHERE job.id = due.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_execution_jobs(integer, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ai_execution_jobs(integer, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_execution_jobs(integer, uuid, integer) TO service_role;
