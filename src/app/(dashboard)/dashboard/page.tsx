import type { Metadata } from "next";
import { getCurrentProfile, getUserOrganizations } from "@/modules/auth/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [profile, organizations] = await Promise.all([
    getCurrentProfile(),
    getUserOrganizations(),
  ]);

  const currentOrg = organizations[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {profile.display_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here is an overview of your organization.
        </p>
      </div>

      {/* Organization info */}
      {currentOrg ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Organization</CardDescription>
              <CardTitle className="text-lg">{currentOrg.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground font-mono">
                /{currentOrg.slug}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Created {formatDate(currentOrg.created_at)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Your role</CardDescription>
              <CardTitle className="text-lg capitalize">{currentOrg.role}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {currentOrg.role === "owner" &&
                  "Full access to all organization settings and resources"}
                {currentOrg.role === "admin" &&
                  "Can manage team members and all resources"}
                {currentOrg.role === "agent" &&
                  "Can manage leads and conversations"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>System status</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                Operational
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Foundation phase active. AI features coming in Phase 4.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No organization found. Please contact support.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Phase roadmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Roadmap</CardTitle>
          <CardDescription>
            Features are being built incrementally. This is Phase 1 — the
            foundation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { phase: "Phase 1", label: "Foundation (auth, organizations, API)", done: true },
              { phase: "Phase 2", label: "Lead & Property Management", done: false },
              { phase: "Phase 3", label: "Conversations & Follow-up Automation", done: false },
              { phase: "Phase 4", label: "AI Sales Agent", done: false },
              { phase: "Phase 5", label: "WhatsApp & Email Integration", done: false },
              { phase: "Phase 6", label: "Analytics & Billing", done: false },
            ].map((item) => (
              <div
                key={item.phase}
                className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0"
              >
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    item.done ? "bg-green-500" : "bg-muted-foreground/30"
                  }`}
                />
                <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
                  {item.phase}
                </span>
                <span className={item.done ? "" : "text-muted-foreground"}>
                  {item.label}
                </span>
                {item.done && (
                  <span className="ml-auto text-xs text-green-600 font-medium">
                    Complete
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
