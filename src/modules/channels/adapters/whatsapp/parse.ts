import { ValidationError } from "@/lib/errors";
import { canonicalInboundSchema } from "@/modules/channels/schema";
import type { ChannelInboundAdapterResult } from "@/modules/channels/adapters/types";

const IGNORED: ChannelInboundAdapterResult = { status: "ignored" };

export function normalizeWhatsAppAddress(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function occurredAtFromUnix(timestamp: string): string | undefined {
  if (!/^\d{10,13}$/.test(timestamp.trim())) {
    return undefined;
  }
  const numeric = Number(timestamp.trim());
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  const ms = timestamp.trim().length <= 10 ? numeric * 1000 : numeric;
  const iso = new Date(ms).toISOString();
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

interface WhatsAppTextCandidate {
  id: string;
  from: string;
  body: string | undefined;
  timestamp?: string;
  to: string;
  type: string;
}

function collectMessages(payload: unknown): WhatsAppTextCandidate[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const candidates: WhatsAppTextCandidate[] = [];
  for (const entry of asArray(root.entry)) {
    const entryRecord = asRecord(entry);
    if (!entryRecord) continue;
    for (const change of asArray(entryRecord.changes)) {
      const changeRecord = asRecord(change);
      if (!changeRecord) continue;
      const value = asRecord(changeRecord.value);
      if (!value) continue;
      const metadata = asRecord(value.metadata) ?? {};
      const to = readString(metadata, "phone_number_id").trim();
      for (const message of asArray(value.messages)) {
        const messageRecord = asRecord(message);
        if (!messageRecord) continue;
        const text = asRecord(messageRecord.text);
        candidates.push({
          id: readString(messageRecord, "id").trim(),
          from: readString(messageRecord, "from").trim(),
          body: text ? readString(text, "body") : undefined,
          timestamp: readString(messageRecord, "timestamp").trim() || undefined,
          to,
          type: readString(messageRecord, "type").trim() || "unknown",
        });
      }
    }
  }
  return candidates;
}

/**
 * Convert a WhatsApp Cloud API webhook JSON value into CanonicalInbound.
 * Supported: inbound text only. Unsupported but well-formed events are ignored.
 * Incomplete text messages are malformed.
 */
export function parseWhatsAppInbound(payload: unknown): ChannelInboundAdapterResult {
  const messages = collectMessages(payload);
  const textMessages = messages.filter((message) => message.type === "text");

  if (textMessages.length === 0) {
    return IGNORED;
  }

  const first = textMessages[0];
  if (!first) {
    return IGNORED;
  }
  const from = normalizeWhatsAppAddress(first.from);
  const to = first.to.trim();
  const body = first.body?.trim() ?? "";

  if (!first.id || !from || !to || !body) {
    throw new ValidationError("Invalid webhook payload");
  }

  const parsed = canonicalInboundSchema.safeParse({
    providerMessageId: first.id,
    from,
    to,
    body,
    occurredAt: first.timestamp
      ? occurredAtFromUnix(first.timestamp)
      : undefined,
  });

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid webhook payload",
      parsed.error.flatten().fieldErrors
    );
  }

  return { status: "inbound", event: parsed.data };
}

export function parseWhatsAppInboundBody(rawBody: string): ChannelInboundAdapterResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return parseWhatsAppInbound(payload);
}
