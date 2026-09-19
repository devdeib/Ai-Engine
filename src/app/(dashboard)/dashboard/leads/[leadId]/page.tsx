import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { LeadDetailClient } from "@/modules/leads/components/lead-detail-client";
import { Card, CardContent } from "@/components/ui/card";

interface LeadDetailPageProps {
  params: Promise<{ leadId: string }>;
}

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: LeadDetailPageProps) {
  const { leadId } = await params;

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

  return (
    <LeadDetailClient organizationId={currentOrg.id} leadId={leadId} />
  );
}
