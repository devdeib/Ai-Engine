import type { Metadata } from "next";
import { getCurrentProfile, getCurrentOrganization } from "@/modules/auth/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { OrganizationSettingsForm } from "@/modules/organizations/components/organization-settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [profile, currentOrg] = await Promise.all([
    getCurrentProfile(),
    getCurrentOrganization(),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Your personal account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span>{profile.display_name}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-3">
            <span className="text-muted-foreground">Member since</span>
            <span>{formatDate(profile.created_at)}</span>
          </div>
        </CardContent>
      </Card>

      {currentOrg ? (
        <>
          <OrganizationSettingsForm
            organizationId={currentOrg.id}
            role={currentOrg.role}
            initialName={currentOrg.name}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organization</CardTitle>
              <CardDescription>
                You are a{" "}
                <span className="font-medium capitalize">{currentOrg.role}</span>{" "}
                of this organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-mono text-xs">{currentOrg.slug}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-3">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(currentOrg.created_at)}</span>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danger Zone</CardTitle>
          <CardDescription>Destructive actions for this workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Account deletion, organization transfer, and data export are not
            available yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
