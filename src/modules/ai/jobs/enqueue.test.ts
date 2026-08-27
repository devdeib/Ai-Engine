/**
 * Enqueue tests. Duplicate (org, inbound_message_id) is idempotent.
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
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { AI_JOB_MAX_ATTEMPTS } from "@/modules/ai/jobs/constants";
import { AI_EXECUTION_JOB_INSERT_KEYS } from "@/modules/ai/jobs/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";

function mockInsert(error: { code?: string; message?: string } | null) {
  const captured: Record<string, unknown>[] = [];
  const insert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    captured.push(payload);
    return Promise.resolve({ error });
  });
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "ai_execution_jobs") return { insert };
      return {};
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  return { insert, captured };
}

describe("enqueueAiExecutionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts only trusted identifiers and job metadata", async () => {
    const { captured } = mockInsert(null);
    await enqueueAiExecutionJob({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      inboundMessageId: MSG_1,
    });

    expect(captured).toHaveLength(1);
    expect(Object.keys(captured[0] ?? {}).sort()).toEqual(
      [...AI_EXECUTION_JOB_INSERT_KEYS].sort()
    );
    expect(captured[0]).toEqual({
      organization_id: ORG_A,
      conversation_id: CONV_1,
      inbound_message_id: MSG_1,
      requested_by_user_id: USER_1,
      trigger_source: "operator",
      channel_identity_id: null,
      status: "pending",
      max_attempts: AI_JOB_MAX_ATTEMPTS,
    });
    expect(JSON.stringify(captured[0])).not.toContain("prompt");
    expect(JSON.stringify(captured[0])).not.toContain("sk-");
    expect(JSON.stringify(captured[0])).not.toContain("apiKey");
  });

  it("treats a duplicate inbound-message job as success", async () => {
    mockInsert({ code: "23505", message: "duplicate key value" });
    await expect(
      enqueueAiExecutionJob({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        inboundMessageId: MSG_1,
      })
    ).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("surfaces a non-duplicate insert failure so the caller can retry", async () => {
    mockInsert({ code: "42501", message: "permission denied for table" });
    await expect(
      enqueueAiExecutionJob({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        inboundMessageId: MSG_1,
      })
    ).rejects.toThrow("Failed to enqueue AI execution job");
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to enqueue AI execution job",
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        code: "42501",
      })
    );
    const logged = vi.mocked(logger.error).mock.calls[0]?.[1];
    expect(JSON.stringify(logged)).not.toContain("permission denied");
  });
});
