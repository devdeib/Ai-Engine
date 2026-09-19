import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { LeadsClient } from "@/modules/leads/components/leads-client";
import { Card, CardContent } from "@/components/ui/card";
import LeadsLoading from "./loading";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
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

  // LeadsClient uses useSearchParams() which requires a Suspense boundary
  // in the Next.js App Router.
  return (
    <Suspense fallback={<LeadsLoading />}>
      <LeadsClient organizationId={currentOrg.id} />
    </Suspense>
  );
}
