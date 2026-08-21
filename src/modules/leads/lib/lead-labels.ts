/**
 * Display labels and styling for lead enum values.
 * Pure utilities — no React, no side effects.
 */
import type { LeadSource, LeadStatus } from "@/lib/db/types";

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

/** Tailwind classes for the status badge pill. */
export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-blue-50 text-blue-700 ring-blue-600/20",
  contacted: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  qualified: "bg-green-50 text-green-700 ring-green-600/20",
  unqualified: "bg-gray-100 text-gray-600 ring-gray-500/20",
  lost: "bg-red-50 text-red-700 ring-red-600/20",
  converted: "bg-purple-50 text-purple-700 ring-purple-600/20",
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
