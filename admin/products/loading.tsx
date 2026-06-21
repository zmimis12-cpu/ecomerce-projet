export default function ProductsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="h-6 w-24 rounded bg-secondary animate-pulse" />
        <div className="h-4 w-52 rounded bg-secondary/60 animate-pulse" />
      </div>
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-64 rounded-lg bg-secondary animate-pulse" />
        <div className="h-9 w-36 rounded-lg bg-primary/20 animate-pulse ml-auto" />
      </div>
      {/* Table skeleton */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b bg-secondary/30 px-4 py-3 flex gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-3 w-16 rounded bg-secondary animate-pulse" />
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b px-4 py-3 flex gap-4 items-center">
            <div className="h-10 w-10 rounded-lg bg-secondary/60 animate-pulse shrink-0" />
            <div className="h-4 w-36 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-20 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-24 rounded bg-secondary/60 animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
