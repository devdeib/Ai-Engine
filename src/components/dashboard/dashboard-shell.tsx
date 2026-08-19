"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building2,
  MessageSquare,
  CalendarDays,
  Bot,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Building,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import { signOutAction } from "@/modules/auth/actions";
import type { Profile, OrganizationWithRole } from "@/lib/db/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    implemented: true,
  },
  {
    label: "Leads",
    href: "/dashboard/leads",
    icon: Users,
    implemented: false,
  },
  {
    label: "Properties",
    href: "/dashboard/properties",
    icon: Building2,
    implemented: false,
  },
  {
    label: "Conversations",
    href: "/dashboard/conversations",
    icon: MessageSquare,
    implemented: false,
  },
  {
    label: "Appointments",
    href: "/dashboard/appointments",
    icon: CalendarDays,
    implemented: false,
  },
  {
    label: "AI Agent",
    href: "/dashboard/ai-agent",
    icon: Bot,
    implemented: false,
  },
  {
    label: "Analytics",
    href: "/dashboard/analytics",
    icon: BarChart3,
    implemented: false,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    implemented: true,
  },
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

  return (
    <div className="flex min-h-[100dvh] bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-60 flex-col fixed inset-y-0 left-0 bg-sidebar border-r border-sidebar-border">
        <SidebarContent
          pathname={pathname}
          profile={profile}
          organizations={organizations}
          currentOrganization={currentOrganization}
        />
      </aside>

      {/* Sidebar — mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex w-60 h-full flex-col bg-sidebar">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-sidebar-foreground/60 hover:text-sidebar-foreground"
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

      {/* Main content */}
      <div className="flex flex-col flex-1 lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {currentOrganization && (
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {currentOrganization.name}
              </span>
            )}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {getInitials(profile.display_name)}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
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
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 px-4 border-b border-sidebar-border">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-sidebar-primary">
          <span className="text-xs font-bold text-sidebar-primary-foreground">
            VG
          </span>
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">
          AI Sales Engine
        </span>
      </div>

      {/* Organization context */}
      {currentOrganization && (
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-sidebar-accent">
            <Building className="h-3.5 w-3.5 text-sidebar-accent-foreground/70 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">
                {currentOrganization.name}
              </p>
              <p className="text-[10px] text-sidebar-accent-foreground/60 capitalize">
                {currentOrganization.role}
              </p>
            </div>
            {organizations.length > 1 && (
              <ChevronDown className="h-3 w-3 text-sidebar-accent-foreground/50 shrink-0" />
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                !item.implemented &&
                  !isActive &&
                  "opacity-60 cursor-default pointer-events-none"
              )}
              aria-disabled={!item.implemented}
              title={
                !item.implemented ? `${item.label} — coming soon` : item.label
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {!item.implemented && (
                <span className="text-[9px] font-mono uppercase tracking-wide opacity-50">
                  soon
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center gap-3 mb-2 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold shrink-0">
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
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
