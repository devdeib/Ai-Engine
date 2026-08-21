export default function LeadDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back nav */}
      <div className="h-4 w-24 rounded-md bg-muted" />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-7 w-52 rounded-md bg-muted" />
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-full bg-muted" />
            <div className="h-5 w-20 rounded-md bg-muted" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 rounded-md bg-muted" />
          <div className="h-8 w-16 rounded-md bg-muted" />
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border p-6 space-y-3">
            <div className="h-4 w-24 rounded-md bg-muted" />
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex gap-3">
                <div className="h-4 w-16 rounded-md bg-muted shrink-0" />
                <div className="h-4 w-32 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
