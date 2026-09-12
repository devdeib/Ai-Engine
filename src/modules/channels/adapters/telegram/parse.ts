import { ValidationError } from "@/lib/errors";
import { CHANNEL_STUB_LEAD_LAST_NAME } from "@/modules/channels/constants";
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

function readNamePart(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 100);
}

/**
 * Map Telegram private-chat sender fields onto lead first/last names.
 * Matching still uses chat id. Returns null when Telegram provided no name.
 */
export function telegramSenderLeadName(
  from: Record<string, unknown> | null
): { firstName: string; lastName: string } | null {
  if (!from) {
    return null;
  }
  const firstName = readNamePart(from.first_name);
  const lastName = readNamePart(from.last_name);
  const username = readNamePart(from.username);
  if (firstName && lastName) {
    return { firstName, lastName };
  }
  if (firstName) {
    return { firstName, lastName: CHANNEL_STUB_LEAD_LAST_NAME };
  }
  if (username) {
    return { firstName: username, lastName: CHANNEL_STUB_LEAD_LAST_NAME };
  }
  return null;
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

  const fromUser = asRecord(message.from) ?? chat;
  const senderName = telegramSenderLeadName(fromUser);
  const parsed = canonicalInboundSchema.safeParse({
    providerMessageId: updateId,
    from,
    to,
    body,
    occurredAt: occurredAtFromUnixSeconds(message.date),
    ...(senderName
      ? {
          senderFirstName: senderName.firstName,
          senderLastName: senderName.lastName,
        }
      : {}),
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
