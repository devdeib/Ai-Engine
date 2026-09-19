import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { Card, CardContent } from "@/components/ui/card";
import { OverviewDashboard } from "@/modules/dashboard/components/overview-dashboard";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function DashboardPage() {
  const currentOrg = await getCurrentOrganization();

  if (!currentOrg) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No organization found. Please contact support.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <OverviewDashboard organizationId={currentOrg.id} />;
}
