import type { Metadata } from "next";
import { DEMO_ANALYTICS } from "@/modules/dashboard/demo-catalog";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="space-y-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEMO_ANALYTICS.metrics.map((metric) => (
          <div key={metric.label} className="px-1 py-1">
            <p className="text-xs font-medium text-muted-foreground">
              {metric.label}
            </p>
            <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-zeus-black">
              {metric.value}
            </p>
            <p className="mt-1 text-xs tabular-nums text-zeus-blue">
              {metric.delta}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Lead sources
          </h2>
          <div className="mt-5 space-y-4">
            {DEMO_ANALYTICS.channels.map((channel) => (
              <div key={channel.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-zeus-black/80">
                    {channel.label}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {channel.count}
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zeus-black/[0.08]">
                  <div
                    className="h-full rounded-full bg-zeus-blue/80"
                    style={{ width: `${channel.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground">Team</h2>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Agent</th>
                <th className="py-3 pr-4 font-medium">Leads</th>
                <th className="py-3 pr-4 font-medium">Qualified</th>
                <th className="py-3 font-medium">Viewings</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ANALYTICS.agents.map((agent) => (
                <tr
                  key={agent.name}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="py-3.5 pr-4 font-medium">{agent.name}</td>
                  <td className="py-3.5 pr-4 tabular-nums text-muted-foreground">
                    {agent.leads}
                  </td>
                  <td className="py-3.5 pr-4 tabular-nums text-muted-foreground">
                    {agent.qualified}
                  </td>
                  <td className="py-3.5 tabular-nums text-muted-foreground">
                    {agent.viewings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
