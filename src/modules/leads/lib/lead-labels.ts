/**
 * Display labels and styling for lead enum values.
 * Pure utilities — no React, no side effects.
 */
import type { LeadSource, LeadStatus } from "@/lib/db/types";
import type { QualificationStatus } from "@/modules/leads/qualification";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Website",
  referral: "Referral",
  cold_call: "Cold Call",
  email_campaign: "Email Campaign",
  social_media: "Social Media",
  portal: "Portal",
  other: "Other",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  unqualified: "Unqualified",
  lost: "Lost",
  converted: "Converted",
};

/** Tailwind classes for the status badge pill. Distinct per status. */
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-zeus-black/[0.04] text-muted-foreground",
  contacted: "bg-zeus-black/[0.06] text-zeus-black/70",
  qualified: "bg-zeus-blue/12 text-zeus-blue",
  unqualified: "bg-zeus-black/[0.03] text-zeus-black/50",
  lost: "bg-destructive/10 text-red-700",
  converted: "bg-zeus-blue/18 text-zeus-black",
};

export const QUALIFICATION_STATUS_CLASSES: Record<QualificationStatus, string> = {
  not_started: "bg-zeus-black/[0.04] text-muted-foreground",
  qualifying: "bg-zeus-black/[0.06] text-zeus-black/75",
  qualified: "bg-zeus-blue/12 text-zeus-blue",
};

/** Ordered source options for select menus. */
export const LEAD_SOURCE_OPTIONS: { value: LeadSource; label: string }[] =
  (Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][]).map(
    ([value, label]) => ({ value, label })
  );

/** Ordered status options for select menus. */
export const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] =
  (Object.entries(LEAD_STATUS_LABELS) as [LeadStatus, string][]).map(
    ([value, label]) => ({ value, label })
  );
