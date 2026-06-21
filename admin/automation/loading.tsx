export default function AutomationLoading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-32 rounded bg-secondary animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-secondary animate-pulse" />
            <div className="h-6 w-10 rounded bg-secondary animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="border-b px-4 py-3 flex gap-4">
            <div className="h-4 w-24 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-32 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-16 rounded bg-secondary/60 animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
