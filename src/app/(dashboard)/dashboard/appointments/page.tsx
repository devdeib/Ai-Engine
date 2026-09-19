import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentOrganization } from "@/modules/auth/queries";
import { AppointmentsQueueClient } from "@/modules/appointments/components/appointments-queue-client";
import { Card, CardContent } from "@/components/ui/card";
import AppointmentsLoading from "./loading";

export const metadata: Metadata = { title: "Appointments" };

export default async function AppointmentsPage() {
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
    <Suspense fallback={<AppointmentsLoading />}>
      <AppointmentsQueueClient organizationId={currentOrg.id} />
    </Suspense>
  );
}
