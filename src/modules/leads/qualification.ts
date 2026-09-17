/**
 * Server-owned qualification facts and derived status.
 * Status is never stored and never accepted from the model.
 */
export const QUALIFICATION_FACT_KEYS = [
  "budget",
  "timeline",
  "location",
  "property_type",
  "financing",
  "decision_maker",
] as const;

export const REQUIRED_QUALIFICATION_FACT_KEYS = [
  "budget",
  "timeline",
  "location",
] as const;

export const MISSING_REQUIRED_FIELD_ORDER = [
  "budget",
  "timeline",
  "location",
  "contact",
] as const;

export const QUALIFICATION_STATUSES = [
  "not_started",
  "qualifying",
  "qualified",
] as const;

export const QUALIFICATION_FACT_VALUE_MAX = 200;

export type QualificationFactKey = (typeof QUALIFICATION_FACT_KEYS)[number];
export type RequiredQualificationFactKey =
  (typeof REQUIRED_QUALIFICATION_FACT_KEYS)[number];
export type MissingRequiredField = (typeof MISSING_REQUIRED_FIELD_ORDER)[number];
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number];
export type QualificationFacts = Partial<Record<QualificationFactKey, string>>;

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  not_started: "Not started",
  qualifying: "Qualifying",
  qualified: "Qualified",
};

export const QUALIFICATION_FACT_LABELS: Record<QualificationFactKey, string> = {
  budget: "Budget",
  timeline: "Timeline",
  location: "Location",
  property_type: "Property type",
  financing: "Financing",
  decision_maker: "Decision maker",
};

export const MISSING_REQUIRED_FIELD_LABELS: Record<MissingRequiredField, string> =
  {
    budget: "Budget",
    timeline: "Timeline",
    location: "Location",
    contact: "Email or phone",
  };

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

export function isContactable(
  email: string | null | undefined,
  phone: string | null | undefined
): boolean {
  return !isBlank(email) || !isBlank(phone);
}

export function parseQualificationFacts(raw: unknown): QualificationFacts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const facts: QualificationFacts = {};
  const record = raw as Record<string, unknown>;
  for (const key of QUALIFICATION_FACT_KEYS) {
    const value = record[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    facts[key] = trimmed;
  }
  return facts;
}

export function hasRequiredQualificationFact(
  facts: QualificationFacts
): boolean {
  return REQUIRED_QUALIFICATION_FACT_KEYS.some(
    (key) => !isBlank(facts[key])
  );
}

export function deriveQualificationStatus(input: {
  email?: string | null;
  phone?: string | null;
  facts: QualificationFacts;
}): QualificationStatus {
  const requiredPresent = REQUIRED_QUALIFICATION_FACT_KEYS.every(
    (key) => !isBlank(input.facts[key])
  );
  if (requiredPresent && isContactable(input.email, input.phone)) {
    return "qualified";
  }
  if (hasRequiredQualificationFact(input.facts)) {
    return "qualifying";
  }
  return "not_started";
}

export function missingRequiredFields(input: {
  email?: string | null;
  phone?: string | null;
  facts: QualificationFacts;
}): MissingRequiredField[] {
  const missing: MissingRequiredField[] = [];
  for (const key of REQUIRED_QUALIFICATION_FACT_KEYS) {
    if (isBlank(input.facts[key])) {
      missing.push(key);
    }
  }
  if (!isContactable(input.email, input.phone)) {
    missing.push("contact");
  }
  return missing;
}

export interface LeadQualificationView {
  facts: QualificationFacts;
  qualificationStatus: QualificationStatus;
  missingRequiredFields: MissingRequiredField[];
}

export function buildLeadQualificationView(input: {
  email?: string | null;
  phone?: string | null;
  qualificationFacts?: unknown;
}): LeadQualificationView {
  const facts = parseQualificationFacts(input.qualificationFacts);
  return {
    facts,
    qualificationStatus: deriveQualificationStatus({
      email: input.email,
      phone: input.phone,
      facts,
    }),
    missingRequiredFields: missingRequiredFields({
      email: input.email,
      phone: input.phone,
      facts,
    }),
  };
}

/** AI-facing prior-CRM labels. Does not change stored qualification derivation. */
export function leadQualificationContextFields(input: {
  email?: string | null;
  phone?: string | null;
  qualificationFacts?: unknown;
}) {
  const view = buildLeadQualificationView(input);
  return {
    priorQualificationFacts: view.facts,
    priorQualificationStatus: view.qualificationStatus,
    priorMissingRequiredFields: view.missingRequiredFields,
  };
}
