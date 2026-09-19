/**
 * Automatic inbound AI trigger.
 *
 * This module only decides WHETHER to enqueue AI execution.
 * Eligibility, context, provider, validation, persistence, and idempotency
 * remain exclusively in processConversationMessage (invoked by the worker).
 *
 * Queue and AI failures are swallowed after a durable inbound insert so
 * customer messages are never rolled back because execution is unavailable.
 */
import "server-only";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enqueueAiExecutionJob } from "@/modules/ai/jobs/enqueue";
import { scheduleAiJobProcessing } from "@/modules/ai/jobs/schedule";
import { processDueAiJobs } from "@/modules/ai/jobs/worker";
import { processDueChannelDeliveryJobs } from "@/modules/channels/delivery/worker";
import type { Message } from "@/lib/db/types";

export async function triggerAiAfterInboundMessage(input: {
  organizationId: string;
  userId: string;
  conversationId: string;
  message: Pick<Message, "id" | "direction" | "author_type">;
}): Promise<void> {
  if (input.message.direction !== "inbound") {
    return;
  }
  if (input.message.author_type !== "human") {
    return;
  }

  try {
    await enqueueAiExecutionJob({
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      inboundMessageId: input.message.id,
    });
    scheduleAiJobProcessing(async () => {
      await processDueAiJobs({ organizationId: input.organizationId });
      await processDueChannelDeliveryJobs({
        organizationId: input.organizationId,
      });
    });
  } catch (error) {
    logger.error("Failed to enqueue AI execution after inbound message", {
      organizationId: input.organizationId,
      userId: input.userId,
      conversationId: input.conversationId,
      code: isAppError(error) ? error.code : "INTERNAL_ERROR",
    });
  }
}
