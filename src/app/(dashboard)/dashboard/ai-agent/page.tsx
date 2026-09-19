import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { AiActionCenter } from "@/modules/ai/components/ai-action-center";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "AI Action Center" };

export default async function AIAgentPage() {
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
    <Suspense
      fallback={<div className="h-24 rounded-md bg-muted animate-pulse" />}
    >
      <AiActionCenter organizationId={currentOrg.id} />
    </Suspense>
  );
}
