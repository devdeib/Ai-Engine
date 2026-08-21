export default function ConversationsLoading() {
  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem)] min-h-[480px] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded-md bg-muted animate-pulse" />
          <div className="h-3 w-48 rounded-md bg-muted animate-pulse hidden sm:block" />
        </div>
        <div className="h-8 w-40 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full md:w-80 lg:w-96 border-r">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2 border-b animate-pulse">
              <div className="flex justify-between">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="h-4 w-12 rounded-full bg-muted" />
              </div>
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          ))}
        </div>
        <div className="hidden md:flex min-w-0 flex-1 flex-col">
          <div className="border-b px-4 py-3 space-y-2 animate-pulse">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
          <div className="flex-1 space-y-4 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <div className="h-12 w-48 rounded-2xl bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
