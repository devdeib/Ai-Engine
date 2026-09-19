// DEMO DATA - TEMPORARY FOR PRODUCT SCREENSHOTS/VIDEO
// Isolated presentation records only. Do not persist to the database.
// Remove this module after the product demo is recorded.

export type DemoQualification = "Qualified" | "Qualifying" | "New";

export interface DemoMetric {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}

export interface DemoPipelineStage {
  label: string;
  count: number;
  share: number;
}

export interface DemoLead {
  id: string;
  name: string;
  interest: string;
  location: string;
  budget: string;
  timeline: string;
  qualification: DemoQualification;
  lastActivity: string;
}

export interface DemoConversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  status: "Open" | "Closed";
  channel: string;
}

export interface DemoActivityItem {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "fact" | "qualification" | "conversation" | "follow_up";
}

export {
  DEMO_OVERVIEW_METRICS as DEMO_METRICS,
  DEMO_OVERVIEW_PIPELINE as DEMO_PIPELINE,
  DEMO_OVERVIEW_LEADS as DEMO_RECENT_LEADS,
  DEMO_OVERVIEW_CONVERSATIONS as DEMO_RECENT_CONVERSATIONS,
  DEMO_OVERVIEW_ACTIVITY as DEMO_ACTIVITY,
} from "@/modules/dashboard/demo-catalog";
