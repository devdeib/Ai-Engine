"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { Lead } from "@/lib/db/types";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_CLASSES,
} from "@/modules/leads/lib/lead-labels";

export interface OrgMemberOption {
  user_id: string;
  display_name: string;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function LeadTableSkeleton() {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {["Name", "Email", "Phone", "Source", "Status", "Score", "Owner", "Created"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {[140, 180, 120, 90, 80, 60, 100, 80].map((w, j) => (
                  <td key={j} className="px-4 py-3">
                    <div
                      className="h-4 rounded bg-muted"
                      style={{ width: w }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

interface LeadTableErrorProps {
  onRetry: () => void;
}

export function LeadTableError({ onRetry }: LeadTableErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border bg-muted">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="font-medium">Failed to load leads</p>
      <p className="mt-1 text-sm text-muted-foreground">
        An error occurred while loading your leads.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface LeadTableEmptyProps {
  onNewLead: () => void;
}

export function LeadTableEmpty({ onNewLead }: LeadTableEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
        <Users className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No leads yet</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        Create your first lead to start building your sales pipeline.
      </p>
      <Button className="mt-6" onClick={onNewLead}>
        <Plus className="h-4 w-4" />
        New Lead
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual lead row
// ---------------------------------------------------------------------------

function LeadRow({
  lead,
  members,
}: {
  lead: Lead;
  members: OrgMemberOption[];
}) {
  const fullName = `${lead.first_name} ${lead.last_name}`;
  const owner = lead.owner_id
    ? (members.find((m) => m.user_id === lead.owner_id)?.display_name ?? "—")
    : null;

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3 font-medium">
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {fullName}
        </Link>
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {lead.email ?? <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
        {lead.phone ?? <span className="text-muted-foreground/50">—</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {lead.company_name ?? (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
        {LEAD_SOURCE_LABELS[lead.source]}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            LEAD_STATUS_CLASSES[lead.status]
          )}
        >
          {LEAD_STATUS_LABELS[lead.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
        {lead.score !== null ? (
          <span className="tabular-nums">{lead.score}</span>
        ) : (
          <span className="text-muted-foreground/50 text-xs">Not scored</span>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell whitespace-nowrap">
        {owner ?? <span className="text-muted-foreground/50 text-xs">Unassigned</span>}
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell whitespace-nowrap">
        {formatDate(lead.created_at)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main table
// ---------------------------------------------------------------------------

interface LeadTableProps {
  leads: Lead[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onNewLead: () => void;
  members?: OrgMemberOption[];
}

export function LeadTable({
  leads,
  isLoading,
  error,
  onRetry,
  onNewLead,
  members = [],
}: LeadTableProps) {
  if (isLoading) {
    return <LeadTableSkeleton />;
  }

  if (error) {
    return <LeadTableError onRetry={onRetry} />;
  }

  if (leads.length === 0) {
    return <LeadTableEmpty onNewLead={onNewLead} />;
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Email
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                Phone
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
                Company
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                Source
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
                Score
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden xl:table-cell">
                Owner
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((lead) => (
              <LeadRow key={lead.id} lead={lead} members={members} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
