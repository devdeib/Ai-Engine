"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ConversationWithLead, Lead } from "@/lib/db/types";
import { QUALIFICATION_STATUS_CLASSES } from "@/modules/leads/lib/lead-labels";
import {
  QUALIFICATION_STATUS_LABELS,
  buildLeadQualificationView,
  type QualificationStatus,
} from "@/modules/leads/qualification";
import {
  CONVERSATION_STATUS_LABELS,
  leadDisplayName,
} from "@/modules/conversations/lib/conversation-labels";

export interface OverviewDashboardProps {
  organizationId: string;
}

function leadInterest(lead: Lead): string {
  const { facts } = buildLeadQualificationView({
    email: lead.email,
    phone: lead.phone,
    qualificationFacts: lead.qualification_facts,
  });
  const parts = [facts.property_type, facts.location].filter(Boolean);
  return parts.join(" · ");
}

export function OverviewDashboard({ organizationId }: OverviewDashboardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [conversations, setConversations] = useState<ConversationWithLead[]>([]);
  const [conversationCount, setConversationCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const [leadsRes, conversationsRes] = await Promise.all([
          fetch(
            `/api/v1/organizations/${organizationId}/leads?page=1&limit=20`,
            { credentials: "same-origin" }
          ),
          fetch(
            `/api/v1/organizations/${organizationId}/conversations?page=1&limit=5`,
            { credentials: "same-origin" }
          ),
        ]);

        if (cancelled) return;

        if (leadsRes.ok) {
          const json = (await leadsRes.json()) as {
            data: Lead[];
            meta?: { count?: number };
          };
          setLeads(json.data ?? []);
          setLeadCount(json.meta?.count ?? json.data?.length ?? 0);
        }

        if (conversationsRes.ok) {
          const json = (await conversationsRes.json()) as {
            data: ConversationWithLead[];
            meta?: { count?: number };
          };
          setConversations(json.data ?? []);
          setConversationCount(json.meta?.count ?? json.data?.length ?? 0);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const qualificationCounts: Record<QualificationStatus, number> = {
    not_started: 0,
    qualifying: 0,
    qualified: 0,
  };
  for (const lead of leads) {
    const view = buildLeadQualificationView({
      email: lead.email,
      phone: lead.phone,
      qualificationFacts: lead.qualification_facts,
    });
    qualificationCounts[view.qualificationStatus] += 1;
  }

  const pipeline = [
    { label: "New", count: qualificationCounts.not_started, key: "not_started" as const },
    { label: "Qualifying", count: qualificationCounts.qualifying, key: "qualifying" as const },
    { label: "Qualified", count: qualificationCounts.qualified, key: "qualified" as const },
  ];
  const pipelineTotal = leads.length || 1;

  const metrics = [
    { label: "Total leads", value: String(leadCount) },
    { label: "Qualified", value: String(qualificationCounts.qualified) },
    { label: "Qualifying", value: String(qualificationCounts.qualifying) },
    { label: "Conversations", value: String(conversationCount) },
  ];

  const recentLeads = leads.slice(0, 5);
  const recentConversations = conversations.slice(0, 4);

  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse" aria-hidden="true">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 py-1">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-8 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="h-40 rounded bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="px-1 py-1">
              <p className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-zeus-black">
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Lead pipeline</h2>
          {leads.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            <div className="mt-5 space-y-4">
              {pipeline.map((stage) => (
                <div key={stage.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-zeus-black/80">{stage.label}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {stage.count}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zeus-black/[0.08]">
                    <div
                      className="h-full rounded-full bg-zeus-blue/80"
                      style={{
                        width: `${Math.round((stage.count / pipelineTotal) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Recent conversations
            </h2>
            <Link
              href="/dashboard/conversations"
              className="text-xs font-medium text-muted-foreground hover:text-zeus-blue"
            >
              View all
            </Link>
          </div>
          {recentConversations.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {recentConversations.map((conversation) => (
                <li key={conversation.id} className="py-3.5 first:pt-2">
                  <Link
                    href={`/dashboard/conversations?conversation=${conversation.id}`}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {leadDisplayName(conversation.lead)}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {CONVERSATION_STATUS_LABELS[conversation.status]}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatRelativeTime(conversation.updated_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Recent leads</h2>
          <Link
            href="/dashboard/leads"
            className="text-xs font-medium text-muted-foreground hover:text-zeus-blue"
          >
            View all
          </Link>
        </div>
        {recentLeads.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">No leads yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="py-3 pr-4 font-medium">Lead</th>
                  <th className="py-3 pr-4 font-medium">Interest</th>
                  <th className="py-3 pr-4 font-medium">Budget</th>
                  <th className="py-3 pr-4 font-medium">Timeline</th>
                  <th className="py-3 font-medium">Qualification</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => {
                  const qualification = buildLeadQualificationView({
                    email: lead.email,
                    phone: lead.phone,
                    qualificationFacts: lead.qualification_facts,
                  });
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-border/70 last:border-0 hover:bg-zeus-blue/10"
                    >
                      <td className="py-3.5 pr-4">
                        <Link
                          href={`/dashboard/leads/${lead.id}`}
                          className="font-medium text-foreground hover:text-zeus-blue"
                        >
                          {lead.first_name} {lead.last_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {qualification.facts.location ?? "—"}
                        </p>
                      </td>
                      <td className="py-3.5 pr-4 text-muted-foreground">
                        {leadInterest(lead) || "—"}
                      </td>
                      <td className="py-3.5 pr-4 tabular-nums text-foreground/90">
                        {qualification.facts.budget ?? "—"}
                      </td>
                      <td className="py-3.5 pr-4 text-muted-foreground">
                        {qualification.facts.timeline ?? "—"}
                      </td>
                      <td className="py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                            QUALIFICATION_STATUS_CLASSES[
                              qualification.qualificationStatus
                            ]
                          )}
                        >
                          {
                            QUALIFICATION_STATUS_LABELS[
                              qualification.qualificationStatus
                            ]
                          }
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
