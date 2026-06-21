export default function CCOrdersLoading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded bg-secondary animate-pulse" />
      <div className="flex gap-2">
        <div className="h-9 w-64 rounded-lg bg-secondary animate-pulse" />
        <div className="h-9 w-36 rounded-lg bg-secondary animate-pulse" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="border-b px-4 py-3 flex gap-4 items-center">
            <div className="h-4 w-24 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-32 rounded bg-secondary/60 animate-pulse" />
            <div className="h-4 w-20 rounded bg-secondary/60 animate-pulse ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
