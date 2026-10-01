/** Filtre de période en GET (fonctionne sans JS). */
export function PeriodFilter({ period, extra }: { period: string; extra?: Record<string, string> }) {
  const now = new Date();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return (
    <form method="get" className="flex items-center gap-2">
      {extra && Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select name="month" defaultValue={period} className="h-9 rounded-md border bg-background px-3 text-sm">
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="all">Tout</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {new Date(m + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </option>
        ))}
      </select>
      <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Filtrer</button>
    </form>
  );
}

/** Période par défaut : 30 derniers jours (glissant). */
export function currentMonth() {
  return "30d";
}

export function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " MAD";
}

export function rate(delivered: number, orders: number) {
  return orders > 0 ? Math.round((delivered / orders) * 100) + "%" : "—";
}
