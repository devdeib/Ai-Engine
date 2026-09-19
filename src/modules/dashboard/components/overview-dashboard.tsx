import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  DEMO_ACTIVITY,
  DEMO_METRICS,
  DEMO_PIPELINE,
  DEMO_RECENT_CONVERSATIONS,
  DEMO_RECENT_LEADS,
  type DemoQualification,
} from "@/modules/dashboard/demo-data";

function qualificationClass(status: DemoQualification): string {
  if (status === "Qualified") {
    return "bg-zeus-blue/12 text-zeus-blue";
  }
  if (status === "Qualifying") {
    return "bg-zeus-black/[0.06] text-zeus-black/75";
  }
  return "bg-zeus-black/[0.04] text-muted-foreground";
}

export function OverviewDashboard() {
  return (
    <div className="space-y-8">
      <section>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {DEMO_METRICS.map((metric) => (
            <div key={metric.label} className="px-1 py-1">
              <p className="text-xs font-medium text-muted-foreground">
                {metric.label}
              </p>
              <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-zeus-black">
                {metric.value}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs tabular-nums",
                  metric.positive ? "text-zeus-blue" : "text-muted-foreground"
                )}
              >
                {metric.delta}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Lead pipeline</h2>
          <div className="mt-5 space-y-4">
            {DEMO_PIPELINE.map((stage) => (
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
                    style={{ width: `${stage.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
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
          <ul className="mt-3 divide-y divide-border">
            {DEMO_RECENT_CONVERSATIONS.map((conversation) => (
              <li key={conversation.id} className="py-3.5 first:pt-2">
                <Link
                  href={`/dashboard/conversations?conversation=${conversation.id}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {conversation.name}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {conversation.lastMessage}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {conversation.time}
                    </p>
                    <p className="mt-1 text-[11px] text-zeus-black/45">
                      {conversation.status}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
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
              {DEMO_RECENT_LEADS.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-border/70 last:border-0 hover:bg-zeus-blue/10"
                >
                  <td className="py-3.5 pr-4">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="font-medium text-foreground hover:text-zeus-blue"
                    >
                      {lead.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{lead.location}</p>
                  </td>
                  <td className="py-3.5 pr-4 text-muted-foreground">
                    {lead.interest}
                  </td>
                  <td className="py-3.5 pr-4 tabular-nums text-foreground/90">
                    {lead.budget}
                  </td>
                  <td className="py-3.5 pr-4 text-muted-foreground">
                    {lead.timeline}
                  </td>
                  <td className="py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
                        qualificationClass(lead.qualification)
                      )}
                    >
                      {lead.qualification}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-2xl">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Activity</h2>
          <Link
            href="/dashboard/activity"
            className="text-xs font-medium text-muted-foreground hover:text-zeus-blue"
          >
            View all
          </Link>
        </div>
        <ul className="mt-4 space-y-4">
          {DEMO_ACTIVITY.slice(0, 4).map((item) => (
            <li key={item.id} className="flex gap-3">
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  item.kind === "qualification" ? "bg-zeus-blue" : "bg-zeus-black/20"
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">{item.title}</p>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {item.time}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
