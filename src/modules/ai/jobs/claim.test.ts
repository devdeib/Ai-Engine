/**
 * Claim RPC wrapper tests. Atomic claiming lives in SQL (SKIP LOCKED).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { claimAiExecutionJobs } from "@/modules/ai/jobs/claim";
import { AI_JOB_LEASE_SECONDS } from "@/modules/ai/jobs/constants";
import type { AiExecutionJob } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";

function makeJob(overrides: Partial<AiExecutionJob> = {}): AiExecutionJob {
  return {
    id: "job-1",
    organization_id: ORG_A,
    conversation_id: "cccccccc-0000-4000-8000-000000000001",
    inbound_message_id: "11111111-0000-4000-8000-0000000000aa",
    requested_by_user_id: "00000000-0000-4000-8000-000000000001",
    trigger_source: "operator",
    channel_identity_id: null,
    status: "processing",
    attempt_count: 1,
    max_attempts: 3,
    available_at: "2026-08-22T00:00:00Z",
    locked_at: "2026-08-22T00:00:01Z",
    last_error_code: null,
    created_at: "2026-08-22T00:00:00Z",
    updated_at: "2026-08-22T00:00:01Z",
    completed_at: null,
    ...overrides,
  };
}

describe("claimAiExecutionJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the atomic claim RPC with lease and organization scope", async () => {
    const job = makeJob();
    const rpc = vi.fn().mockResolvedValue({ data: [job], error: null });
    vi.mocked(createClient).mockResolvedValue({
      rpc,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const claimed = await claimAiExecutionJobs({
      limit: 1,
      organizationId: ORG_A,
    });

    expect(rpc).toHaveBeenCalledWith("claim_ai_execution_jobs", {
      p_limit: 1,
      p_organization_id: ORG_A,
      p_lease_seconds: AI_JOB_LEASE_SECONDS,
    });
    expect(claimed).toEqual([job]);
  });

  it("returns an empty list when the RPC errors without leaking SQL", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function does not exist" },
    });
    vi.mocked(createClient).mockResolvedValue({
      rpc,
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      claimAiExecutionJobs({ limit: 5, organizationId: ORG_A })
    ).resolves.toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to claim AI execution jobs",
      expect.objectContaining({
        organizationId: ORG_A,
        code: "PGRST202",
      })
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls[0]?.[1])).not.toContain(
      "function does not exist"
    );
  });
});
