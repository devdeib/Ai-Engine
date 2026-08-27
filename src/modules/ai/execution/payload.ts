/**
 * Server-owned follow-up payload for Phase 4.8. Deterministic per inbound.
 * Never uses model text or Date.now().
 */
import { createFollowUpToolInputSchema } from "@/modules/ai/tools/write-schemas";
import type { CreateFollowUpToolInput } from "@/modules/ai/tools/write-schemas";
import {
  AI_SALES_RECOMMENDATION_FOLLOW_UP_OFFSET_MS,
  AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE,
} from "@/modules/ai/execution/constants";

export function followUpDueAtFromInbound(inboundMessageCreatedAt: string): string {
  const createdMs = Date.parse(inboundMessageCreatedAt);
  if (!Number.isFinite(createdMs)) {
    return "";
  }
  return new Date(
    createdMs + AI_SALES_RECOMMENDATION_FOLLOW_UP_OFFSET_MS
  ).toISOString();
}

export function buildServerFollowUpInput(
  inboundMessageCreatedAt: string
): CreateFollowUpToolInput | null {
  const dueAt = followUpDueAtFromInbound(inboundMessageCreatedAt);
  const parsed = createFollowUpToolInputSchema.safeParse({
    title: AI_SALES_RECOMMENDATION_FOLLOW_UP_TITLE,
    notes: null,
    dueAt,
  });
  return parsed.success ? parsed.data : null;
}
