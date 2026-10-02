import type { TaxReport } from "@/lib/ads/meta-tax";
import { MetaTaxForm } from "@/components/ads/meta-tax-form";

const V: Record<string, { label: string; cls: string }> = {
  none:    { label: "✅ Sans taxe",           cls: "bg-green-100 text-green-800" },
  tax:     { label: "🔴 Avec taxe",           cls: "bg-red-100 text-red-800" },
  missing: { label: "⚠️ Paiement manquant ?", cls: "bg-amber-100 text-amber-800" },
  unclear: { label: "— Non mesurable",        cls: "bg-gray-100 text-gray-600" },
};
const usd = (x: number) => `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r = (x: number | null) => (x == null ? "—" : x.toFixed(2));

/** Carte "Taxe Meta" : compare chaque prélèvement carte avec la dépense pub réelle. */
export function MetaTaxCard({ report, rate, tax }: { report: TaxReport | { error: string }; rate: number; tax: { pct: number; since: string | null } }) {
  if ("error" in report) {
    return <div className="rounded-xl border bg-card p-4 text-sm text-red-600">Taxe Meta : lecture impossible ({report.error})</div>;
  }
  const taxSet = tax.pct > 0;
  return (
    <div className={`rounded-xl border-2 p-4 ${taxSet ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}`}>
      <div className="mb-3 rounded-lg border bg-white p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          ⚠️ <b>Meta ne donne pas la taxe dans son API</b> : les prélèvements ci-dessous sont <b>hors taxe</b>.
          Ta banque prélève plus (ex : 50 $ → 60 $ avec 20 % de TVA). Indique la taxe ici : elle sera ajoutée à
          <b> toutes</b> les dépenses pub (dashboard, coût par commande, règles, éditeurs…).
        </p>
        <MetaTaxForm pct={tax.pct} since={tax.since} />
        {taxSet && (
          <p className="mt-2 text-xs font-medium text-amber-800">
            ✅ Taxe de {tax.pct} % appliquée depuis le {tax.since ? new Date(tax.since).toLocaleDateString("fr-FR") : "début"} —
            prélevé réellement ≈ {usd(report.paidUsd * (1 + tax.pct / 100))} (au lieu de {usd(report.paidUsd)} hors taxe).
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contrôle des prélèvements (hors taxe)</div>
          <div className="mt-1 text-base font-semibold">
            {report.taxAlert ? "Écart anormal détecté entre prélèvements et dépense" : "Prélèvements Meta cohérents avec la dépense (hors taxe)"}
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
                <th className="px-3 py-2 text-right">Prélevé (HT)</th>
                {taxSet && <th className="px-3 py-2 text-right">Avec taxe</th>}
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
                  {taxSet && <td className="px-3 py-1.5 text-right">{tax.since && c.time.slice(0, 10) < tax.since ? usd(c.amountUsd) : usd(c.amountUsd * (1 + tax.pct / 100))}</td>}
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
