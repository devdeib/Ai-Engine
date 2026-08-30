import { AuthenticationError, ValidationError } from "@/lib/errors";
import { canonicalInboundSchema } from "@/modules/channels/schema";
import {
  SMS_PAYLOAD_TYPE,
  SMS_RECEIVED_EVENT,
} from "@/modules/channels/adapters/sms/constants";
import type { ChannelInboundAdapterResult } from "@/modules/channels/adapters/types";

const IGNORED: ChannelInboundAdapterResult = { status: "ignored" };

const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/**
 * SMS-local destination normalization. Adapter-local. Fail closed.
 * Does not reuse WhatsApp digit-stripping, Email lowercasing, or country guessing.
 *
 * 1. Trim whitespace.
 * 2. Extract `Name <number>` if present.
 * 3. Keep a single leading `+` if present.
 * 4. Remove non-digit characters after the leading `+`.
 * 5. Require canonical `+` E.164-style form (8–15 digits).
 */
export function normalizeSmsAddress(value: string): string | null {
  const trimmed = value.trim();
  const angle = trimmed.match(/<([^<>]+)>/);
  const raw = (angle?.[1] ?? trimmed).trim();
  if (!raw.startsWith("+")) {
    return null;
  }
  const digits = raw.slice(1).replace(/\D/g, "");
  if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
    return null;
  }
  return `+${digits}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readPhoneNumber(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return normalizeSmsAddress(readString(record, "phone_number"));
}

function readUsableTimestamp(...candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && Number.isFinite(Date.parse(trimmed))) {
      return trimmed;
    }
  }
  return undefined;
}

function resolveTenantDestination(
  recipients: string[],
  destination: string | undefined
): string {
  if (destination === undefined) {
    return recipients[0] ?? "";
  }
  const tenantDestination = normalizeSmsAddress(destination);
  if (!tenantDestination) {
    throw new AuthenticationError();
  }
  const matchingTo = recipients.find((recipient) => recipient === tenantDestination);
  if (!matchingTo) {
    throw new AuthenticationError();
  }
  return matchingTo;
}

function readToNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const numbers: string[] = [];
  for (const item of value) {
    const normalized = readPhoneNumber(item);
    if (normalized) {
      numbers.push(normalized);
    }
  }
  return numbers;
}

export function parseSmsWebhookJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function parseSmsInbound(
  payload: unknown,
  destination?: string
): ChannelInboundAdapterResult {
  const root = asRecord(payload);
  if (!root) {
    throw new ValidationError("Invalid webhook payload");
  }

  const data = asRecord(root.data);
  if (!data) {
    throw new ValidationError("Invalid webhook payload");
  }

  const eventType = readString(data, "event_type").trim();
  if (eventType !== SMS_RECEIVED_EVENT) {
    return IGNORED;
  }

  const eventPayload = asRecord(data.payload);
  if (!eventPayload) {
    throw new ValidationError("Invalid webhook payload");
  }

  const payloadType = readString(eventPayload, "type").trim();
  if (payloadType !== SMS_PAYLOAD_TYPE) {
    return IGNORED;
  }

  const providerMessageId = readString(eventPayload, "id").trim();
  const from = readPhoneNumber(eventPayload.from);
  const recipients = readToNumbers(eventPayload.to);
  const body = readString(eventPayload, "text").trim();
  const occurredAt = readUsableTimestamp(
    readString(data, "occurred_at"),
    readString(eventPayload, "received_at")
  );

  if (!providerMessageId || !from || recipients.length === 0) {
    throw new ValidationError("Invalid webhook payload");
  }

  if (!body) {
    return IGNORED;
  }

  const to = resolveTenantDestination(recipients, destination);

  const parsed = canonicalInboundSchema.safeParse({
    providerMessageId,
    from,
    to,
    body,
    occurredAt,
  });

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid webhook payload",
      parsed.error.flatten().fieldErrors
    );
  }

  return { status: "inbound", event: parsed.data };
}

export function parseSmsInboundBody(
  rawBody: string,
  destination?: string
): ChannelInboundAdapterResult {
  return parseSmsInbound(parseSmsWebhookJson(rawBody), destination);
}
