import "server-only";
import { after } from "next/server";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export function scheduleChannelDeliveryProcessing(
  task: () => Promise<void>
): void {
  try {
    after(async () => {
      try {
        await task();
      } catch (error: unknown) {
        logger.error("Channel delivery processing failed", {
          code: isAppError(error) ? error.code : "INTERNAL_ERROR",
        });
      }
    });
  } catch {
    logger.warn("Channel delivery processing was not scheduled");
  }
}
