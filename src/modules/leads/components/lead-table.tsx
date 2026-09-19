"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import type { Lead } from "@/lib/db/types";
import { QUALIFICATION_STATUS_CLASSES } from "@/modules/leads/lib/lead-labels";
import {
  QUALIFICATION_STATUS_LABELS,
  buildLeadQualificationView,
} from "@/modules/leads/qualification";

export interface OrgMemberOption {
  user_id: string;
  display_name: string;
}

const TABLE_COLUMNS = [
  "Lead",
  "Interest",
  "Budget",
  "Timeline",
  "Qualification",
  "Last activity",
] as const;

function dash() {
  return <span className="text-muted-foreground/40">—</span>;
}

function leadInterest(lead: Lead): string | null {
  const { facts } = buildLeadQualificationView({
    email: lead.email,
    phone: lead.phone,
    qualificationFacts: lead.qualification_facts,
  });
  const parts = [facts.property_type, facts.location].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

export function LeadTableSkeleton() {
  return (
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              {TABLE_COLUMNS.map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left text-xs font-medium text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse border-b border-border/60">
                {[160, 180, 100, 90, 90, 80].map((w, j) => (
                  <td key={j} className="px-3 py-3.5">
                    <div className="h-4 rounded bg-muted" style={{ width: w }} />
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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card">
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
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card">
        <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.75} />
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

function LeadRow({ lead }: { lead: Lead }) {
  const fullName = `${lead.first_name} ${lead.last_name}`;
  const qualification = buildLeadQualificationView({
    email: lead.email,
    phone: lead.phone,
    qualificationFacts: lead.qualification_facts,
  });
  const interest = leadInterest(lead);

  return (
    <tr className="border-b border-border/70 last:border-0 hover:bg-zeus-blue/10 transition-colors">
      <td className="px-3 py-3.5">
        <Link
          href={`/dashboard/leads/${lead.id}`}
          className="font-medium hover:text-zeus-blue focus-visible:text-zeus-blue focus-visible:outline-none"
        >
          {fullName}
        </Link>
        {lead.email ? (
          <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-[220px]">
            {lead.email}
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3.5 text-muted-foreground">
        {interest ?? dash()}
      </td>
      <td className="px-3 py-3.5 tabular-nums text-foreground/90">
        {qualification.facts.budget ?? dash()}
      </td>
      <td className="px-3 py-3.5 text-muted-foreground hidden md:table-cell">
        {qualification.facts.timeline ?? dash()}
      </td>
      <td className="px-3 py-3.5">
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
            QUALIFICATION_STATUS_CLASSES[qualification.qualificationStatus]
          )}
        >
          {QUALIFICATION_STATUS_LABELS[qualification.qualificationStatus]}
        </span>
      </td>
      <td className="px-3 py-3.5 text-xs tabular-nums text-muted-foreground hidden lg:table-cell whitespace-nowrap">
        {formatRelativeTime(lead.updated_at)}
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
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
              Lead
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
              Interest
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
              Budget
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">
              Timeline
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
              Qualification
            </th>
            <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">
              Last activity
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
