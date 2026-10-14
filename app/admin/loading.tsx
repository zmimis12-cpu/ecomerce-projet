/** Squelette de chargement (au lieu d'un simple spinner). */
export default function AdminLoading() {
  const block = "relative overflow-hidden rounded-xl bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent";
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className={`${block} h-7 w-48`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className={`${block} h-24`} />)}
      </div>
      <div className={`${block} h-64`} />
    </div>
  );
}
