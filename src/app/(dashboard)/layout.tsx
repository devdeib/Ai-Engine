import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentProfile,
  getCurrentOrganization,
  getUserOrganizations,
} from "@/modules/auth/queries";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [profile, organizations] = await Promise.all([
    getCurrentProfile(),
    getUserOrganizations(),
  ]);

  const currentOrg = await getCurrentOrganization(organizations);

  return (
    <DashboardShell
      profile={profile}
      organizations={organizations}
      currentOrganization={currentOrg}
    >
      {children}
    </DashboardShell>
  );
}
