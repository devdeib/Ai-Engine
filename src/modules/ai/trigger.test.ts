/**
 * Automatic inbound AI trigger tests.
 * The trigger enqueues a job; it does not run processConversationMessage.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/ai/jobs/enqueue", () => ({
  enqueueAiExecutionJob: vi.fn(),
}));

vi.mock("@/modules/ai/jobs/schedule", () => ({
  scheduleAiJobProcessing: vi.fn(),
}));

vi.mock("@/modules/ai/jobs/worker", () => ({
  processDueAiJobs: vi.fn(),
}));

vi.mock("@/modules/ai/service", () => ({
  processConversationMessage: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { scheduleAiJobProcessing } from "@/modules/ai/jobs/schedule";
import { processDueAiJobs } from "@/modules/ai/jobs/worker";
import { processConversationMessage } from "@/modules/ai/service";
import { triggerAiAfterInboundMessage } from "@/modules/ai/trigger";
import { logger } from "@/lib/logger";
import type { Message } from "@/lib/db/types";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_1 = "00000000-0000-4000-8000-000000000001";
const CONV_1 = "cccccccc-0000-4000-8000-000000000001";
const MSG_1 = "11111111-0000-4000-8000-0000000000aa";

function message(
  overrides: Partial<Pick<Message, "id" | "direction" | "author_type">> = {}
): Pick<Message, "id" | "direction" | "author_type"> {
  return {
    id: MSG_1,
    direction: "inbound",
    author_type: "human",
    ...overrides,
  };
}

describe("triggerAiAfterInboundMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enqueueAiExecutionJob).mockResolvedValue(undefined);
  });

  it("enqueues exactly one AI job for a human inbound message", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message(),
    });

    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      inboundMessageId: MSG_1,
    });
    expect(scheduleAiJobProcessing).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not enqueue for a human outbound message", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message({ direction: "outbound", author_type: "human" }),
    });
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("does not enqueue for an AI outbound message", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message({ direction: "outbound", author_type: "ai" }),
    });
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("does not enqueue for a system message", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message({ direction: "inbound", author_type: "system" }),
    });
    expect(enqueueAiExecutionJob).not.toHaveBeenCalled();
  });

  it("still enqueues when eligibility would later skip or escalate", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message(),
    });
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(1);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("swallows enqueue failure without throwing", async () => {
    vi.mocked(enqueueAiExecutionJob).mockRejectedValue(new Error("queue down"));
    await expect(
      triggerAiAfterInboundMessage({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        message: message(),
      })
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to enqueue AI execution after inbound message",
      expect.objectContaining({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        code: "INTERNAL_ERROR",
      })
    );
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("swallows concurrent enqueue without throwing", async () => {
    const results = await Promise.allSettled([
      triggerAiAfterInboundMessage({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        message: message(),
      }),
      triggerAiAfterInboundMessage({
        organizationId: ORG_A,
        userId: USER_1,
        conversationId: CONV_1,
        message: message(),
      }),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(enqueueAiExecutionJob).toHaveBeenCalledTimes(2);
    expect(processConversationMessage).not.toHaveBeenCalled();
  });

  it("uses trusted organization, conversation, and inbound message ids", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message(),
    });
    expect(enqueueAiExecutionJob).toHaveBeenCalledWith({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      inboundMessageId: MSG_1,
    });
    expect(JSON.stringify(vi.mocked(enqueueAiExecutionJob).mock.calls[0])).not.toContain(
      "sk-"
    );
  });

  it("schedules processing that drains jobs for the trusted organization", async () => {
    await triggerAiAfterInboundMessage({
      organizationId: ORG_A,
      userId: USER_1,
      conversationId: CONV_1,
      message: message(),
    });

    const scheduled = vi.mocked(scheduleAiJobProcessing).mock.calls[0]?.[0];
    expect(scheduled).toBeTypeOf("function");
    await scheduled?.();
    expect(processDueAiJobs).toHaveBeenCalledWith({ organizationId: ORG_A });
  });
});
