export default function CCLoading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-32 rounded bg-secondary animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="h-4 w-4 rounded bg-secondary animate-pulse" />
            <div className="h-6 w-10 rounded bg-secondary animate-pulse" />
            <div className="h-3 w-16 rounded bg-secondary/60 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 rounded bg-secondary/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
