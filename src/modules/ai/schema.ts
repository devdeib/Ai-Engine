import { MESSAGE_BODY_MAX } from "@/modules/conversations/schema";
import { AiMalformedResponseError } from "@/modules/ai/errors";

export function sanitizeAiReply(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new AiMalformedResponseError();
  }
  return trimmed.slice(0, MESSAGE_BODY_MAX);
}
