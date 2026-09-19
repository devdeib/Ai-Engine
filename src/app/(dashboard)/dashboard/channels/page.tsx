import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { ChannelAccountsClient } from "@/modules/channels/components/channel-accounts-client";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Channels" };

export default async function ChannelsPage() {
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
    <ChannelAccountsClient
      organizationId={currentOrg.id}
      memberRole={currentOrg.role}
    />
  );
}
