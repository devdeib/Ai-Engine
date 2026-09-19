import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { IdentityMatchingClient } from "@/modules/channels/components/identity-matching-client";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Channel Identities" };

export default async function IdentitiesPage() {
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

  return <IdentityMatchingClient organizationId={currentOrg.id} />;
}
