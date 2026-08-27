/**
 * AI job worker tests. The worker only claims jobs and calls Phase 4.1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConflictError,
  NotFoundError,
  TenantAccessError,
  ValidationError,
} from "@/lib/errors";
import { AiMalformedResponseError, AiProviderError, AiToolError } from "@/modules/ai/errors";
import type { AiExecutionJob } from "@/lib/db/types";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ role: "service" })),
}));

vi.mock("@/lib/supabase/client-override", () => ({
  getSupabaseClientOverride: vi.fn(),
  runWithSupabaseClientOverride: vi.fn(
    async (_client: unknown, fn: () => Promise<number>) => fn()
  ),
}));

vi.mock("@/modules/ai/jobs/claim", () => ({
  claimAiExecutionJobs: vi.fn(),
}));

vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

vi.mock("@/modules/ai/providers", () => ({
  createAiProvider: vi.fn(),
}));

vi.mock("@/modules/leads/activities/queries", () => ({
  recordLeadActivity: vi.fn(),
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
import { createAdminClient } from "@/lib/supabase/admin";
import { runWithSupabaseClientOverride } from "@/lib/supabase/client-override";
import { claimAiExecutionJobs } from "@/modules/ai/jobs/claim";
import { processConversationMessage } from "@/modules/ai/service";
import { createAiProvider } from "@/modules/ai/providers";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { processDueAiJobs } from "@/modules/ai/jobs/worker";
import { logger } from "@/lib/logger";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";

function makeJob(overrides: Partial<AiExecutionJob> = {}): AiExecutionJob {
  return {
    id: "job-1",
    organization_id: ORG_A,
    conversation_id: CONV_1,
    inbound_message_id: MSG_1,
    requested_by_user_id: USER_1,
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

function mockScopeAndUpdates(options: {
  conversation?: { id: string; organization_id: string } | null;
  inbound?: {
    id: string;
    organization_id: string;
    conversation_id: string;
    direction: string;
    author_type: string;
  } | null;
} = {}) {
  const conversation =
    options.conversation === undefined
      ? { id: CONV_1, organization_id: ORG_A }
      : options.conversation;
  const inbound =
    options.inbound === undefined
      ? {
          id: MSG_1,
          organization_id: ORG_A,
          conversation_id: CONV_1,
          direction: "inbound",
          author_type: "human",
        }
      : options.inbound;

  const updates: Record<string, unknown>[] = [];
  const updateOrgIds: string[] = [];

  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "conversations") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: conversation,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: inbound,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "ai_execution_jobs") {
        return {
          update: vi.fn().mockImplementation((patch: Record<string, unknown>) => {
            updates.push(patch);
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((_column: string, value: string) => {
                  updateOrgIds.push(value);
                  return Promise.resolve({ error: null });
                }),
              }),
            };
          }),
        };
      }
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);

  return { updates, updateOrgIds };
}

describe("processDueAiJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "responded",
      messageId: "22222222-0000-4000-8000-0000000000bb",
      activityId: "33333333-0000-4000-8000-0000000000cc",
    });
  });

  it("claims a job and invokes processConversationMessage once", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);

    const claimed = await processDueAiJobs({ organizationId: ORG_A });

    expect(claimed).toBe(1);
    expect(claimAiExecutionJobs).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).toHaveBeenCalledWith(ORG_A, CONV_1, {
      kind: "operator",
      userId: USER_1,
    });
    expect(createAiProvider).not.toHaveBeenCalled();
    expect(recordLeadActivity).not.toHaveBeenCalled();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "completed",
        locked_at: null,
        last_error_code: null,
      })
    );
  });

  it("does not invoke Phase 4.1 when no job is claimed", async () => {
    mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([]);
    await processDueAiJobs({ organizationId: ORG_A });
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("marks skipped execution completed without a fake AI activity", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "skipped",
      reason: "paused",
    });

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(expect.objectContaining({ status: "completed" }));
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("marks escalated execution completed", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);
    vi.mocked(processConversationMessage).mockResolvedValue({
      outcome: "escalated",
      reason: "requires_human",
    });

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(expect.objectContaining({ status: "completed" }));
  });

  it("retries a provider failure while attempts remain", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);
    vi.mocked(processConversationMessage).mockRejectedValue(new AiProviderError());

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "pending",
        last_error_code: "AI_PROVIDER_ERROR",
        locked_at: null,
      })
    );
    expect(updates[0]?.available_at).toEqual(expect.any(String));
    expect(recordLeadActivity).not.toHaveBeenCalled();
  });

  it("marks the job failed when retry count is exhausted", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({ attempt_count: 3, max_attempts: 3 }),
    ]);
    vi.mocked(processConversationMessage).mockRejectedValue(new AiProviderError());

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "AI_PROVIDER_ERROR",
      })
    );
  });

  it("does not retry a tool-call limit failure", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);
    vi.mocked(processConversationMessage).mockRejectedValue(
      new AiToolError("AI_TOOL_LIMIT_EXCEEDED")
    );

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "AI_TOOL_LIMIT_EXCEEDED",
      })
    );
  });

  it("stops retrying permanent malformed AI output", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({ attempt_count: 1, max_attempts: 3 }),
    ]);
    vi.mocked(processConversationMessage).mockRejectedValue(
      new AiMalformedResponseError()
    );

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "AI_MALFORMED_RESPONSE",
      })
    );
  });

  it("treats a duplicate AI message conflict as completed", async () => {
    const { updates } = mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);
    vi.mocked(processConversationMessage).mockRejectedValue(
      new ConflictError("An AI reply already exists for this message")
    );

    await processDueAiJobs({ organizationId: ORG_A });

    expect(updates[0]).toEqual(expect.objectContaining({ status: "completed" }));
  });

  it("does not retry not-found, tenant, or validation failures", async () => {
    const cases = [
      new NotFoundError("Conversation"),
      new TenantAccessError(),
      new ValidationError(),
    ];

    for (const error of cases) {
      vi.clearAllMocks();
      const { updates } = mockScopeAndUpdates();
      vi.mocked(claimAiExecutionJobs).mockResolvedValue([
        makeJob({ attempt_count: 1, max_attempts: 3 }),
      ]);
      vi.mocked(processConversationMessage).mockRejectedValue(error);

      await processDueAiJobs({ organizationId: ORG_A });

      expect(updates[0]).toEqual(expect.objectContaining({ status: "failed" }));
    }
  });

  it("lets only one concurrent worker execute a claimed job", async () => {
    mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs)
      .mockResolvedValueOnce([makeJob()])
      .mockResolvedValueOnce([]);

    await Promise.all([
      processDueAiJobs({ organizationId: ORG_A }),
      processDueAiJobs({ organizationId: ORG_A }),
    ]);

    expect(processConversationMessage).toHaveBeenCalledTimes(1);
  });

  it("executes a reclaimed stale processing job", async () => {
    mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({
        status: "processing",
        attempt_count: 2,
        locked_at: "2026-08-22T00:00:00Z",
      }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).toHaveBeenCalledTimes(1);
  });

  it("does not execute a cross-tenant conversation and fails the job", async () => {
    const { updates } = mockScopeAndUpdates({ conversation: null });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({ organization_id: ORG_A, conversation_id: CONV_1 }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "TENANT_ACCESS_DENIED",
      })
    );
  });

  it("does not redirect execution when the inbound message identity is forged", async () => {
    const { updates, updateOrgIds } = mockScopeAndUpdates({ inbound: null });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({
        organization_id: ORG_A,
        inbound_message_id: "99999999-0000-4000-8000-000000000099",
      }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "TENANT_ACCESS_DENIED",
      })
    );
    expect(updateOrgIds).toContain(ORG_A);
    expect(updateOrgIds).not.toContain(ORG_B);
  });

  it("does not execute when the inbound message is not a human inbound", async () => {
    mockScopeAndUpdates({
      inbound: {
        id: MSG_1,
        organization_id: ORG_A,
        conversation_id: CONV_1,
        direction: "outbound",
        author_type: "human",
      },
    });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("logs a safe failure code without provider secrets", async () => {
    mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([makeJob()]);
    vi.mocked(processConversationMessage).mockRejectedValue(new AiProviderError());

    await processDueAiJobs({ organizationId: ORG_A });

    expect(logger.error).toHaveBeenCalledWith(
      "AI execution job failed",
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        code: "AI_PROVIDER_ERROR",
      })
    );
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain("sk-");
  });

  it("uses the admin client override only for cron drain", async () => {
    mockScopeAndUpdates();
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([]);

    await processDueAiJobs({ organizationId: ORG_A });
    expect(createAdminClient).not.toHaveBeenCalled();

    await processDueAiJobs({ useAdminClient: true });
    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(runWithSupabaseClientOverride).toHaveBeenCalledTimes(1);
  });

  it("dispatches channel_ingress jobs without a user principal", async () => {
    const identityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mockScopeAndUpdates({
      inbound: {
        id: MSG_1,
        organization_id: ORG_A,
        conversation_id: CONV_1,
        direction: "inbound",
        author_type: "customer",
      },
    });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({
        requested_by_user_id: null,
        trigger_source: "channel_ingress",
        channel_identity_id: identityId,
      }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).toHaveBeenCalledWith(ORG_A, CONV_1, {
      kind: "channel_ingress",
    });
  });

  it("rejects a channel_ingress job that forges an operator user", async () => {
    const { updates } = mockScopeAndUpdates({
      inbound: {
        id: MSG_1,
        organization_id: ORG_A,
        conversation_id: CONV_1,
        direction: "inbound",
        author_type: "customer",
      },
    });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({
        requested_by_user_id: USER_1,
        trigger_source: "channel_ingress",
        channel_identity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });

    expect(processConversationMessage).not.toHaveBeenCalled();
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_error_code: "TENANT_ACCESS_DENIED",
      })
    );
  });

  it("does not execute channel_ingress against a human operator inbound", async () => {
    mockScopeAndUpdates({
      inbound: {
        id: MSG_1,
        organization_id: ORG_A,
        conversation_id: CONV_1,
        direction: "inbound",
        author_type: "human",
      },
    });
    vi.mocked(claimAiExecutionJobs).mockResolvedValue([
      makeJob({
        requested_by_user_id: null,
        trigger_source: "channel_ingress",
        channel_identity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ]);

    await processDueAiJobs({ organizationId: ORG_A });
    expect(processConversationMessage).not.toHaveBeenCalled();
  });
});
