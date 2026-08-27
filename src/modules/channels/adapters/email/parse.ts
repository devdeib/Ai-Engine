import { ValidationError } from "@/lib/errors";
import { canonicalInboundSchema } from "@/modules/channels/schema";
import { EMAIL_RECEIVED_EVENT } from "@/modules/channels/adapters/email/constants";
import type { ChannelInboundAdapterResult } from "@/modules/channels/adapters/types";

const IGNORED: ChannelInboundAdapterResult = { status: "ignored" };

/**
 * Deterministic Email identity normalization. Adapter-local.
 * Trim, extract `Name <addr>` if present, lowercase. No alias/dot/+ rewriting.
 */
export function normalizeEmailAddress(value: string): string {
  const trimmed = value.trim();
  const angle = trimmed.match(/<([^<>]+)>/);
  const address = (angle?.[1] ?? trimmed).trim();
  return address.toLowerCase();
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export interface EmailReceivedMetadata {
  emailId: string;
  from: string;
  recipients: string[];
  text: string | null;
  occurredAt: string | undefined;
}

export function parseEmailReceivedMetadata(
  payload: unknown
): { status: "ignored" } | { status: "received"; metadata: EmailReceivedMetadata } {
  const root = asRecord(payload);
  if (!root) {
    throw new ValidationError("Invalid webhook payload");
  }

  const type = readString(root, "type").trim();
  if (type !== EMAIL_RECEIVED_EVENT) {
    return { status: "ignored" };
  }

  const data = asRecord(root.data);
  if (!data) {
    throw new ValidationError("Invalid webhook payload");
  }

  const emailId = readString(data, "email_id").trim();
  const from = normalizeEmailAddress(readString(data, "from"));
  const recipients = readStringArray(data.to)
    .map(normalizeEmailAddress)
    .filter((address) => address.length > 0);
  const textRaw = readString(data, "text").trim();
  const occurredAt =
    readString(data, "created_at").trim() ||
    readString(root, "created_at").trim() ||
    undefined;

  if (!emailId || !from || recipients.length === 0) {
    throw new ValidationError("Invalid webhook payload");
  }

  return {
    status: "received",
    metadata: {
      emailId,
      from,
      recipients,
      text: textRaw.length > 0 ? textRaw : null,
      occurredAt: occurredAt || undefined,
    },
  };
}

export function toCanonicalEmailInbound(input: {
  emailId: string;
  from: string;
  recipients: string[];
  text: string;
  occurredAt?: string;
  destination?: string;
}): ChannelInboundAdapterResult {
  const destination = input.destination
    ? normalizeEmailAddress(input.destination)
    : "";
  const matchingTo =
    destination.length > 0
      ? input.recipients.find((recipient) => recipient === destination)
      : undefined;
  const to = matchingTo ?? input.recipients[0] ?? "";

  const parsed = canonicalInboundSchema.safeParse({
    providerMessageId: input.emailId,
    from: input.from,
    to,
    body: input.text,
    occurredAt: input.occurredAt,
  });

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid webhook payload",
      parsed.error.flatten().fieldErrors
    );
  }

  return { status: "inbound", event: parsed.data };
}

export function parseEmailInbound(
  payload: unknown,
  destination?: string
): ChannelInboundAdapterResult {
  const parsed = parseEmailReceivedMetadata(payload);
  if (parsed.status === "ignored") {
    return IGNORED;
  }

  // 5.3A: Resend webhooks are metadata-only. Live envelopes have no text.
  // 5.3B fetches text via GET /emails/receiving/:id inside this adapter.
  // Fixtures may include data.text to exercise canonical mapping now.
  if (!parsed.metadata.text) {
    return IGNORED;
  }

  return toCanonicalEmailInbound({
    emailId: parsed.metadata.emailId,
    from: parsed.metadata.from,
    recipients: parsed.metadata.recipients,
    text: parsed.metadata.text,
    occurredAt: parsed.metadata.occurredAt,
    destination,
  });
}

export function parseEmailInboundBody(
  rawBody: string,
  destination?: string
): ChannelInboundAdapterResult {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  return parseEmailInbound(payload, destination);
}
