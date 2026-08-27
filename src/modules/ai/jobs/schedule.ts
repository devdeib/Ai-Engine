import "server-only";
import { after } from "next/server";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Runs work after the HTTP response is sent. If there is no request
 * context (unit tests), the job remains pending for a later drain.
 */
export function scheduleAiJobProcessing(task: () => Promise<void>): void {
  try {
    after(() => {
      void task().catch((error: unknown) => {
        logger.error("AI job processing failed", {
          code: isAppError(error) ? error.code : "INTERNAL_ERROR",
        });
      });
    });
  } catch {
    logger.warn("AI job processing was not scheduled");
  }
}
