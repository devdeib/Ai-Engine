import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <ComingSoon
      title="Lead Management"
      description="Capture, qualify, and manage your real estate leads. Track status, score potential, and assign follow-up tasks."
      icon={Users}
      phase="Phase 2"
    />
  );
}
