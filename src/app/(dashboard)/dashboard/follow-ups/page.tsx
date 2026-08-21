import { Suspense } from "react";
import type { Metadata } from "next";
import { getUserOrganizations } from "@/modules/auth/queries";
import { FollowUpsQueueClient } from "@/modules/follow-ups/components/follow-ups-queue-client";
import { Card, CardContent } from "@/components/ui/card";
import FollowUpsLoading from "./loading";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
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
    <Suspense fallback={<FollowUpsLoading />}>
      <FollowUpsQueueClient organizationId={currentOrg.id} />
    </Suspense>
  );
}
