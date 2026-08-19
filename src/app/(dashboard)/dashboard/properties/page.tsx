import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Properties" };

export default function PropertiesPage() {
  return (
    <ComingSoon
      title="Property Management"
      description="Manage your property listings. Match properties to leads automatically based on preferences and budget."
      icon={Building2}
      phase="Phase 2"
    />
  );
}
