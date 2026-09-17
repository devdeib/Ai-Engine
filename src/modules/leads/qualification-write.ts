/**
 * Allowlisted AI write-back for customer-stated lead facts.
 * Never reuse updateLead() — that PATCH accepts human-only fields.
 *
 * Operator edits use applyOperatorQualificationFacts(), a separate merge-patch
 * path that never records activity and never touches contact or pipeline fields.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMembership } from "@/modules/organizations/queries";
import { NotFoundError } from "@/lib/errors";
import { getLead } from "@/modules/leads/queries";
import { recordLeadActivity } from "@/modules/leads/activities/queries";
import { aiRecordedCustomerFactsContent } from "@/modules/leads/activities/activity-content";
import { isChannelStubLead } from "@/modules/channels/match";
import {
  QUALIFICATION_FACT_KEYS,
  buildLeadQualificationView,
  parseQualificationFacts,
  type LeadQualificationView,
  type MissingRequiredField,
  type QualificationFactKey,
  type QualificationFacts,
  type QualificationStatus,
} from "@/modules/leads/qualification";
import type { OperatorQualificationFactsPatch } from "@/modules/leads/qualification-schema";
import type { Lead } from "@/lib/db/types";

export type RecordedCustomerFactField =
  | "email"
  | "phone"
  | "company_name"
  | "first_name"
  | "last_name"
  | QualificationFactKey;

export type RecordedCustomerFactSkipReason = "already_set" | "not_stub";

export interface RecordedCustomerFactSkip {
  field: RecordedCustomerFactField;
  reason: RecordedCustomerFactSkipReason;
}

export interface RecordCustomerFactsPatch {
  email?: string;
  phone?: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  budget?: string;
  timeline?: string;
  location?: string;
  property_type?: string;
  financing?: string;
  decision_maker?: string;
}

export interface ApplyRecordedCustomerFactsResult {
  applied: RecordedCustomerFactField[];
  skipped: RecordedCustomerFactSkip[];
  knownFacts: QualificationFacts;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  qualificationStatus: QualificationStatus;
  missingRequiredFields: MissingRequiredField[];
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function snapshot(lead: Lead, facts: QualificationFacts): string {
  return JSON.stringify({
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    company_name: lead.company_name,
    facts,
  });
}

function toResult(
  lead: Lead,
  view: LeadQualificationView,
  applied: RecordedCustomerFactField[],
  skipped: RecordedCustomerFactSkip[]
): ApplyRecordedCustomerFactsResult {
  return {
    applied,
    skipped,
    knownFacts: view.facts,
    firstName: lead.first_name,
    lastName: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    companyName: lead.company_name,
    qualificationStatus: view.qualificationStatus,
    missingRequiredFields: view.missingRequiredFields,
  };
}

export async function applyRecordedCustomerFacts(
  organizationId: string,
  userId: string | null,
  leadId: string,
  patch: RecordCustomerFactsPatch
): Promise<ApplyRecordedCustomerFactsResult> {
  if (userId !== null) {
    await requireOrgMembership(organizationId, userId);
  }

  const lead = await getLead(leadId, organizationId, userId);
  const existingFacts = parseQualificationFacts(lead.qualification_facts);
  const applied: RecordedCustomerFactField[] = [];
  const skipped: RecordedCustomerFactSkip[] = [];
  const next: Record<string, unknown> = {};

  if (patch.email !== undefined) {
    if (isBlank(lead.email)) {
      next.email = patch.email;
      applied.push("email");
    } else {
      skipped.push({ field: "email", reason: "already_set" });
    }
  }

  if (patch.phone !== undefined) {
    if (isBlank(lead.phone)) {
      next.phone = patch.phone;
      applied.push("phone");
    } else {
      skipped.push({ field: "phone", reason: "already_set" });
    }
  }

  if (patch.company_name !== undefined) {
    if (isBlank(lead.company_name)) {
      next.company_name = patch.company_name;
      applied.push("company_name");
    } else {
      skipped.push({ field: "company_name", reason: "already_set" });
    }
  }

  const stub = isChannelStubLead(lead);
  if (patch.first_name !== undefined) {
    if (stub) {
      next.first_name = patch.first_name;
      applied.push("first_name");
    } else {
      skipped.push({ field: "first_name", reason: "not_stub" });
    }
  }
  if (patch.last_name !== undefined) {
    if (stub) {
      next.last_name = patch.last_name;
      applied.push("last_name");
    } else {
      skipped.push({ field: "last_name", reason: "not_stub" });
    }
  }

  let nextFacts = existingFacts;
  let factsTouched = false;
  for (const key of QUALIFICATION_FACT_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    factsTouched = true;
    nextFacts = { ...nextFacts, [key]: value };
    applied.push(key);
  }
  if (factsTouched) {
    next.qualification_facts = nextFacts;
  }

  const projected: Lead = {
    ...lead,
    first_name:
      typeof next.first_name === "string" ? next.first_name : lead.first_name,
    last_name:
      typeof next.last_name === "string" ? next.last_name : lead.last_name,
    email: next.email !== undefined ? (next.email as string | null) : lead.email,
    phone: next.phone !== undefined ? (next.phone as string | null) : lead.phone,
    company_name:
      next.company_name !== undefined
        ? (next.company_name as string | null)
        : lead.company_name,
    qualification_facts: nextFacts as Record<string, string>,
  };
  const view = buildLeadQualificationView({
    email: projected.email,
    phone: projected.phone,
    qualificationFacts: nextFacts,
  });

  if (applied.length === 0) {
    return toResult(lead, view, applied, skipped);
  }

  const didMutate = snapshot(lead, existingFacts) !== snapshot(projected, nextFacts);
  if (didMutate) {
    next.qualification_updated_at = new Date().toISOString();
  }

  if (!didMutate) {
    return toResult(projected, view, applied, skipped);
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .update(next)
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }

  const saved = data as Lead;
  const savedView = buildLeadQualificationView({
    email: saved.email,
    phone: saved.phone,
    qualificationFacts: saved.qualification_facts,
  });

  await recordLeadActivity({
    organizationId,
    userId,
    leadId,
    type: "ai",
    content: aiRecordedCustomerFactsContent(),
  });

  return toResult(saved, savedView, applied, skipped);
}

function factsEqual(a: QualificationFacts, b: QualificationFacts): boolean {
  return QUALIFICATION_FACT_KEYS.every(
    (key) => (a[key] ?? "") === (b[key] ?? "")
  );
}

function mergeOperatorFacts(
  existing: QualificationFacts,
  patch: OperatorQualificationFactsPatch
): QualificationFacts {
  const next: QualificationFacts = { ...existing };
  for (const key of QUALIFICATION_FACT_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value === null || value.trim() === "") {
      delete next[key];
    } else {
      next[key] = value.trim();
    }
  }
  return next;
}

/**
 * Human-operator merge-patch for allowlisted qualification facts.
 * Does not reuse applyRecordedCustomerFacts() or updateLead().
 */
export async function applyOperatorQualificationFacts(
  organizationId: string,
  userId: string,
  leadId: string,
  factsPatch: OperatorQualificationFactsPatch
): Promise<Lead> {
  await requireOrgMembership(organizationId, userId);

  const lead = await getLead(leadId, organizationId, userId);
  const existingFacts = parseQualificationFacts(lead.qualification_facts);
  const nextFacts = mergeOperatorFacts(existingFacts, factsPatch);

  if (factsEqual(existingFacts, nextFacts)) {
    return lead;
  }

  const qualificationUpdatedAt = new Date().toISOString();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("leads") as any)
    .update({
      qualification_facts: nextFacts,
      qualification_updated_at: qualificationUpdatedAt,
    })
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error || !data) {
    throw new NotFoundError("Lead");
  }

  return data as Lead;
}
