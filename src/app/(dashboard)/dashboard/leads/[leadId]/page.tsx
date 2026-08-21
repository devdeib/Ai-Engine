import type { Metadata } from "next";
import { getUserOrganizations } from "@/modules/auth/queries";
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

  const organizations = await getUserOrganizations();
  const currentOrg = organizations[0] ?? null;

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
