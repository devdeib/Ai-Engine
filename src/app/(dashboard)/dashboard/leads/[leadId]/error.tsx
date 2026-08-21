"use client";

import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LeadDetailError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border bg-muted">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred while loading this lead.
      </p>
      <div className="flex items-center gap-3 mt-6">
        <Button variant="outline" onClick={reset}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/leads">Back to Leads</Link>
        </Button>
      </div>
    </div>
  );
}
