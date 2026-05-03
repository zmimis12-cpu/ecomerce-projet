export default function ScannerLoading() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="h-6 w-24 rounded bg-secondary animate-pulse" />
      <div className="h-12 rounded-xl bg-secondary animate-pulse" />
      <div className="rounded-xl border-2 border-primary/20 bg-card p-5 space-y-4">
        <div className="h-16 rounded-lg bg-secondary animate-pulse" />
        <div className="h-14 rounded-xl bg-secondary/60 animate-pulse" />
      </div>
    </div>
  );
}
