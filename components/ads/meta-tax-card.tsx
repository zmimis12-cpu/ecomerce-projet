import type { TaxReport } from "@/lib/ads/meta-tax";

const V: Record<string, { label: string; cls: string }> = {
  none:    { label: "✅ Sans taxe",           cls: "bg-green-100 text-green-800" },
  tax:     { label: "🔴 Avec taxe",           cls: "bg-red-100 text-red-800" },
  missing: { label: "⚠️ Paiement manquant ?", cls: "bg-amber-100 text-amber-800" },
  unclear: { label: "— Non mesurable",        cls: "bg-gray-100 text-gray-600" },
};
const usd = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r = (x: number | null) => (x == null ? "—" : x.toFixed(2));

/** Carte "Taxe Meta" : compare chaque prélèvement carte avec la dépense pub réelle. */
export function MetaTaxCard({ report, rate }: { report: TaxReport | { error: string }; rate: number }) {
  if ("error" in report) {
    return <div className="rounded-xl border bg-card p-4 text-sm text-red-600">Taxe Meta : lecture impossible ({report.error})</div>;
  }
  const tax = report.taxAlert;
  return (
    <div className={`rounded-xl border-2 p-4 ${tax ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`text-xs font-semibold uppercase tracking-wide ${tax ? "text-red-800" : "text-green-800"}`}>Taxe Meta</div>
          <div className={`mt-1 text-xl font-bold ${tax ? "text-red-900" : "text-green-900"}`}>
            {tax ? `🔴 Taxe détectée ≈ ${report.estimatedTaxPct ?? Math.round(((report.recentRatio ?? 1) - 1) * 100)} %` : "✅ Aucune taxe appliquée"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Rapport payé ÷ dépensé : <b>{r(report.ratio)}</b> (tout) · <b>{r(report.recentRatio)}</b> (30 derniers jours) — 1,00 = sans taxe · 1,20 = taxe 20 %
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-right text-sm">
          <div><div className="text-xs text-muted-foreground">Prélevé sur ta carte</div><div className="font-semibold">{usd(report.paidUsd)}</div></div>
          <div><div className="text-xs text-muted-foreground">Pas encore facturé</div><div className="font-semibold">{usd(report.unbilledUsd)}</div></div>
          <div><div className="text-xs text-muted-foreground">Dépense pub</div><div className="font-semibold">{usd(report.spendUsd)}</div></div>
        </div>
      </div>
      {report.missingUsd >= 5 && (
        <p className="mt-2 text-xs text-amber-800">
          ⚠️ {usd(report.missingUsd)} ({Math.round(report.missingUsd * rate)} MAD) de dépense ne correspondent à aucun prélèvement :
          vérifie dans Meta → Facturation s&apos;il y a un paiement en échec.
        </p>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-primary">Voir chaque transaction ({report.charges.length})</summary>
        <div className="mt-2 max-h-80 overflow-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Prélevé</th>
                <th className="px-3 py-2 text-right">Dépense pub depuis le précédent</th>
                <th className="px-3 py-2 text-right">Rapport</th>
                <th className="px-3 py-2">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {report.charges.map((c) => (
                <tr key={c.time} className="border-t">
                  <td className="px-3 py-1.5">{new Date(c.time).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{usd(c.amountUsd)}</td>
                  <td className="px-3 py-1.5 text-right">{usd(c.spendUsd)}</td>
                  <td className="px-3 py-1.5 text-right">{r(c.ratio)}</td>
                  <td className="px-3 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${V[c.verdict].cls}`}>{V[c.verdict].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Une transaction isolée peut sortir « avec taxe » ou « paiement manquant » à cause du décalage entre la dépense et le moment du prélèvement.
          L&apos;alerte ne s&apos;affiche que si la taxe est confirmée (3 prélèvements de suite, ou sur 30 jours).
        </p>
      </details>
    </div>
  );
}
