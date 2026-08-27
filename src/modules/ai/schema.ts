import { z } from "zod";
import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";
import { AiMalformedResponseError } from "@/modules/ai/errors";

/**
 * Provider output must be a non-empty string within MESSAGE_BODY_MAX.
 * Oversized replies are rejected — never silently truncated.
 */
export const aiReplySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(MESSAGE_BODY_MAX)
  );

export function validateAiReply(raw: unknown): string {
  const result = aiReplySchema.safeParse(raw);
  if (!result.success) {
    throw new AiMalformedResponseError();
  }
  return result.data;
}

/** @deprecated Use validateAiReply — kept as a thin alias for call sites. */
export function sanitizeAiReply(raw: string): string {
  return validateAiReply(raw);
}
