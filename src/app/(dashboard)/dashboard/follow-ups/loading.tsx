export default function FollowUpsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="flex gap-2">
        {[72, 80, 96, 48].map((w) => (
          <div
            key={w}
            className="h-8 rounded-md bg-muted animate-pulse"
            style={{ width: w }}
          />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-md border bg-muted/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
