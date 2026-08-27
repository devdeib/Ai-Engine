/**
 * Test loopback adapter. No outbound URL, no HTTP, no provider SDK.
 *
 * The generic idempotency key is the internal message id. Loopback records
 * loopback:${messageId} as provider_message_id so retries stay the same send.
 * This is at-least-once with a stable key, not exactly-once delivery.
 */
export async function deliverLoopback(input: {
  messageId: string;
  idempotencyKey: string;
}): Promise<{ providerMessageId: string }> {
  return { providerMessageId: `loopback:${input.messageId}` };
}
