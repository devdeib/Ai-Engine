import { Suspense } from "react";
import type { Metadata } from "next";
import { getUserOrganizations } from "@/modules/auth/queries";
import { ConversationsClient } from "@/modules/conversations/components/conversations-client";
import { Card, CardContent } from "@/components/ui/card";
import ConversationsLoading from "./loading";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage() {
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
    <Suspense fallback={<ConversationsLoading />}>
      <ConversationsClient organizationId={currentOrg.id} />
    </Suspense>
  );
}
