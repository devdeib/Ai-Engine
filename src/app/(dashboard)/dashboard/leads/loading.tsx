export default function LeadsLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-16 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="rounded-lg border overflow-hidden">
        {/* Header row */}
        <div className="flex gap-6 px-4 py-3 border-b bg-muted/50">
          {[120, 160, 100, 120, 80, 80].map((w, i) => (
            <div
              key={i}
              className="h-4 rounded bg-muted animate-pulse shrink-0"
              style={{ width: w }}
            />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-6 px-4 py-4 border-b last:border-0 animate-pulse"
          >
            {[120, 160, 100, 120, 80, 80].map((w, j) => (
              <div
                key={j}
                className="h-4 rounded bg-muted shrink-0"
                style={{ width: w, opacity: 0.7 - j * 0.05 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
