import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <ComingSoon
      title="Analytics"
      description="Track lead conversion rates, agent performance, and pipeline health. Make data-driven decisions."
      icon={BarChart3}
    />
  );
}
