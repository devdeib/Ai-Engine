"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Activity,
  Radio,
  Smartphone,
  Clock,
  CalendarDays,
  Zap,
  Settings,
  LogOut,
  Menu,
  X,
  Building,
} from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { signOutAction } from "@/modules/auth/actions";
import { setCurrentOrganizationAction } from "@/modules/organizations/actions";
import { ZeusLogo } from "@/components/brand/zeus-logo";
import { getDashboardPageMeta } from "@/components/dashboard/page-meta";
import type { Profile, OrganizationWithRole } from "@/lib/db/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const mainNav: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/dashboard/leads", icon: Users },
  { label: "Conversations", href: "/dashboard/conversations", icon: MessageSquare },
  { label: "Activity", href: "/dashboard/activity", icon: Activity },
];

const workspaceNav: NavItem[] = [
  { label: "Follow-ups", href: "/dashboard/follow-ups", icon: Clock },
  { label: "Appointments", href: "/dashboard/appointments", icon: CalendarDays },
  { label: "Channels", href: "/dashboard/channels", icon: Radio },
  { label: "Channel Identities", href: "/dashboard/identities", icon: Smartphone },
  { label: "AI Agent", href: "/dashboard/ai-agent", icon: Zap },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface DashboardShellProps {
  profile: Profile;
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
  children: React.ReactNode;
}

export function DashboardShell({
  profile,
  organizations,
  currentOrganization,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const page = getDashboardPageMeta(pathname);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <aside className="hidden lg:flex w-[232px] flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border">
        <SidebarContent
          pathname={pathname}
          profile={profile}
          organizations={organizations}
          currentOrganization={currentOrganization}
        />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-zeus-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex w-[232px] h-full flex-col bg-sidebar border-r border-sidebar-border">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-sidebar-foreground/50 hover:text-zeus-blue"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              pathname={pathname}
              profile={profile}
              organizations={organizations}
              currentOrganization={currentOrganization}
            />
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 lg:pl-[232px]">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background px-4 lg:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-zeus-blue"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {page.title}
            </h1>
            {page.description ? (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {page.description}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            {currentOrganization && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {currentOrganization.name}
              </span>
            )}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md bg-zeus-blue/12 text-[11px] font-semibold text-zeus-black"
              title={profile.display_name}
            >
              {getInitials(profile.display_name)}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  profile,
  organizations,
  currentOrganization,
}: {
  pathname: string;
  profile: Profile;
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole | null;
}) {
  return (
    <>
      <div className="flex h-14 items-center px-4 border-b border-sidebar-border">
        <ZeusLogo />
      </div>

      {currentOrganization ? (
        <div className="px-3 pt-4 pb-1">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <Building className="h-3.5 w-3.5 text-sidebar-foreground/40 shrink-0" />
            <OrganizationSwitcher
              organizations={organizations}
              currentOrganization={currentOrganization}
            />
          </div>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <NavSection title="Main" items={mainNav} pathname={pathname} />
        <NavSection title="Workspace" items={workspaceNav} pathname={pathname} />
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-3 mb-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground text-[11px] font-semibold shrink-0">
            {getInitials(profile.display_name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {profile.display_name}
            </p>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/55 hover:bg-zeus-blue/10 hover:text-zeus-blue transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
        <p className="mt-3 px-2 text-[10px] tracking-wide text-sidebar-foreground/30">
          ZEUS by Virtual Gravity
        </p>
      </div>
    </>
  );
}

function OrganizationSwitcher({
  organizations,
  currentOrganization,
}: {
  organizations: OrganizationWithRole[];
  currentOrganization: OrganizationWithRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (organizations.length < 2) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-sidebar-foreground truncate">
          {currentOrganization.name}
        </p>
        <p className="text-[10px] text-sidebar-foreground/45 capitalize">
          {currentOrganization.role}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <label className="sr-only" htmlFor="workspace-switcher">
        Workspace
      </label>
      <select
        id="workspace-switcher"
        aria-label="Workspace"
        disabled={pending}
        value={currentOrganization.id}
        onChange={(event) => {
          const organizationId = event.target.value;
          startTransition(async () => {
            await setCurrentOrganizationAction(organizationId);
            router.refresh();
          });
        }}
        className="w-full truncate bg-transparent text-xs font-medium text-sidebar-foreground outline-none"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-sidebar-foreground/45 capitalize">
        {currentOrganization.role}
      </p>
    </div>
  );
}

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-5">
      <p className="px-2 mb-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-sidebar-foreground/35">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                isActive
                  ? "text-zeus-blue font-medium"
                  : "text-sidebar-foreground/60 hover:bg-zeus-blue/10 hover:text-zeus-blue"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive
                    ? "text-zeus-blue"
                    : "text-sidebar-foreground/45 group-hover:text-zeus-blue"
                )}
                strokeWidth={1.75}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
