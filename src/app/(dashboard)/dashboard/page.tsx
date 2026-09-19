import type { Metadata } from "next";
import { OverviewDashboard } from "@/modules/dashboard/components/overview-dashboard";

export const metadata: Metadata = {
  title: "Overview",
};

// DEMO DATA - TEMPORARY FOR PRODUCT SCREENSHOTS/VIDEO
export default function DashboardPage() {
  return <OverviewDashboard />;
}
