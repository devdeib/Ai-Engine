import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity",
};

export default function ActivityPage() {
  return (
    <div className="max-w-2xl py-16 text-center">
      <p className="text-sm text-muted-foreground">
        Activity will appear here as leads are qualified, messaged, and updated.
      </p>
    </div>
  );
}
