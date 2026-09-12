import { ValidationError } from "@/lib/errors";
import { canonicalInboundSchema } from "@/modules/channels/schema";
import type { ChannelInboundAdapterResult } from "@/modules/channels/adapters/types";

const IGNORED: ChannelInboundAdapterResult = { status: "ignored" };

export function normalizeTelegramChatId(value: string): string {
  return value.trim();
}

export function normalizeTelegramDestination(value: string): string {
  const trimmed = value.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (/^-?\d+$/.test(withoutAt)) {
    return withoutAt;
  }
  return withoutAt.toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function occurredAtFromUnixSeconds(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const iso = new Date(value * 1000).toISOString();
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

/**
 * Convert a Telegram Bot API update into CanonicalInbound.
 * Supported: private text messages only. Unsupported but well-formed
 * updates are ignored. Incomplete text messages are malformed.
 */
export function parseTelegramInbound(
  payload: unknown,
  destination: string
): ChannelInboundAdapterResult {
  const root = asRecord(payload);
  if (!root) {
    return IGNORED;
  }

  const message = asRecord(root.message);
  if (!message) {
    return IGNORED;
  }

  const chat = asRecord(message.chat);
  const chatType = chat ? String(chat.type ?? "") : "";
  if (chatType !== "private") {
    return IGNORED;
  }

  const textValue = message.text;
  if (typeof textValue !== "string") {
    return IGNORED;
  }

  const updateId = readId(root.update_id);
  const from = chat ? normalizeTelegramChatId(readId(chat.id)) : "";
  const body = textValue.trim();
  const to = normalizeTelegramDestination(destination);

  if (!updateId || !from || !to || !body) {
    throw new ValidationError("Invalid webhook payload");
  }

  const parsed = canonicalInboundSchema.safeParse({
    providerMessageId: updateId,
    from,
    to,
    body,
    occurredAt: occurredAtFromUnixSeconds(message.date),
  });

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid webhook payload",
      parsed.error.flatten().fieldErrors
    );
  }

  return { status: "inbound", event: parsed.data };
}

export function parseTelegramInboundBody(
  rawBody: string,
  destination: string
): ChannelInboundAdapterResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return parseTelegramInbound(payload, destination);
}
