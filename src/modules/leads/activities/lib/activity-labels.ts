/**
 * Display labels for lead activity types. Pure — no React, no side effects.
 */
import type { LeadActivityType } from "@/lib/db/types";
import {
  MANUAL_ACTIVITY_TYPES,
  type ManualActivityType,
} from "@/modules/leads/activities/schema";

export const ACTIVITY_TYPE_LABELS: Record<LeadActivityType, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  status_change: "Status Change",
  conversation: "Conversation",
  follow_up: "Follow-up",
  appointment: "Appointment",
  ai: "AI",
};

export const MANUAL_ACTIVITY_TYPE_OPTIONS: {
  value: ManualActivityType;
  label: string;
}[] = MANUAL_ACTIVITY_TYPES.map((value) => ({
  value,
  label: ACTIVITY_TYPE_LABELS[value],
}));
