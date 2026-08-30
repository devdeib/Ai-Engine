export default function ChannelsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-80 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, row) => (
          <div
            key={row}
            className="h-24 rounded-md border bg-muted/40 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
