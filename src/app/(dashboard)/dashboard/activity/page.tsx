import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { DEMO_ACTIVITY } from "@/modules/dashboard/demo-data";

export const metadata: Metadata = {
  title: "Activity",
};

// DEMO DATA - TEMPORARY FOR PRODUCT SCREENSHOTS/VIDEO
export default function ActivityPage() {
  return (
    <div className="max-w-2xl">
      <ul className="space-y-1">
        {DEMO_ACTIVITY.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "flex gap-4 py-4",
              index !== DEMO_ACTIVITY.length - 1 && "border-b border-border/70"
            )}
          >
            <span
              className={cn(
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                item.kind === "qualification" || item.kind === "fact"
                  ? "bg-zeus-blue"
                  : "bg-zeus-black/20"
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {item.time}
                </time>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
