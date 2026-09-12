/**
 * Channel identity matching helpers.
 *
 * Stub detection is a heuristic based on ingest-created Unknown Customer
 * leads with no contact fields. A human-created lead with the same name and
 * no contact information may therefore be classified as a stub.
 *
 * Matching is server-owned. Callers never supply comparison mode.
 */
import {
  CHANNEL_STUB_LEAD_FIRST_NAME,
  CHANNEL_STUB_LEAD_LAST_NAME,
} from "@/modules/channels/constants";
import type { ChannelKind, Lead, LeadStatus } from "@/lib/db/types";

export const CHANNEL_IDENTITY_MATCH_CANDIDATE_SELECT =
  "id, first_name, last_name, email, phone, company_name, status";

export const CHANNEL_ACCOUNT_MATCH_SELECT = "id, organization_id, channel";

/**
 * PostgREST `or` filter that keeps rows which fail the stub heuristic.
 * Used by the lead list so pagination stays in the database.
 */
export const CHANNEL_STUB_LEAD_EXCLUDE_OR = [
  `first_name.neq.${CHANNEL_STUB_LEAD_FIRST_NAME}`,
  `last_name.neq.${CHANNEL_STUB_LEAD_LAST_NAME}`,
  "and(email.not.is.null,email.neq.)",
  "and(phone.not.is.null,phone.neq.)",
].join(",");

export interface ChannelIdentityMatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  status: LeadStatus;
}

export type ChannelStubLeadFields = Pick<
  Lead,
  "first_name" | "last_name" | "email" | "phone"
>;

function isBlankContact(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

export function isChannelStubLead(lead: ChannelStubLeadFields): boolean {
  return (
    lead.first_name === CHANNEL_STUB_LEAD_FIRST_NAME &&
    lead.last_name === CHANNEL_STUB_LEAD_LAST_NAME &&
    isBlankContact(lead.email) &&
    isBlankContact(lead.phone)
  );
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizeChannelAddress(
  channel: ChannelKind,
  externalAddress: string
): string {
  if (channel === "email") {
    return externalAddress.trim().toLowerCase();
  }
  if (channel === "telegram") {
    return externalAddress.trim();
  }
  if (channel === "whatsapp" || channel === "sms" || channel === "test") {
    return digitsOnly(externalAddress);
  }
  return externalAddress.trim();
}

export function leadMatchesNormalizedAddress(
  channel: ChannelKind,
  normalizedAddress: string,
  lead: Pick<Lead, "email" | "phone">
): boolean {
  if (!normalizedAddress) {
    return false;
  }
  if (channel === "email") {
    return normalizeChannelAddress("email", lead.email ?? "") === normalizedAddress;
  }
  if (channel === "whatsapp" || channel === "sms" || channel === "test") {
    return digitsOnly(lead.phone ?? "") === normalizedAddress;
  }
  return false;
}

export function toPublicMatchCandidate(
  lead: Pick<
    Lead,
    | "id"
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "company_name"
    | "status"
  >
): ChannelIdentityMatchCandidate {
  return {
    id: lead.id,
    firstName: lead.first_name,
    lastName: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company_name,
    status: lead.status,
  };
}
