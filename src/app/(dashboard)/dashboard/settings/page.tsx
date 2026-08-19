import type { Metadata } from "next";
import { getCurrentProfile, getUserOrganizations } from "@/modules/auth/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [profile, organizations] = await Promise.all([
    getCurrentProfile(),
    getUserOrganizations(),
  ]);

  const currentOrg = organizations[0] ?? null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and organization settings.
        </p>
      </div>

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

      {currentOrg && (
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
              <span className="text-muted-foreground">Name</span>
              <span>{currentOrg.name}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Slug</span>
              <span className="font-mono text-xs">{currentOrg.slug}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(currentOrg.created_at)}</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Organization ID</span>
              <span className="font-mono text-xs text-muted-foreground">
                {currentOrg.id}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danger Zone</CardTitle>
          <CardDescription>
            Destructive actions. These features will be available in a future
            phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Account deletion, organization transfer, and data export will be
            available in Phase 6.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
