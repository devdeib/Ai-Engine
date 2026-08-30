export default function IdentitiesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-80 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, column) => (
          <div key={column} className="space-y-3">
            {Array.from({ length: 4 }).map((_, row) => (
              <div
                key={row}
                className="h-20 rounded-md border bg-muted/40 animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
