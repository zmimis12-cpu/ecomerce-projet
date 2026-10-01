import { LiveRefresh } from "@/components/creatives/live-refresh";
import { TONE_CLS } from "@/lib/ads/meta-status";
import { ctr } from "@/lib/creatives/queries";
import type { MetaLiveAd } from "@/lib/ads/meta-live";

/** Tableau "Meta Ads Manager — en direct" (partagé admin + éditeurs). */
const RANK: Record<string, { label: string; cls: string }> = {
  ABOVE_AVERAGE:    { label: "Au-dessus", cls: "bg-green-100 text-green-800" },
  AVERAGE:          { label: "Moyen",     cls: "bg-gray-100 text-gray-700" },
  BELOW_AVERAGE_35: { label: "Bas (35 %)", cls: "bg-amber-100 text-amber-800" },
  BELOW_AVERAGE_20: { label: "Bas (20 %)", cls: "bg-orange-100 text-orange-800" },
  BELOW_AVERAGE_10: { label: "Bas (10 %)", cls: "bg-red-100 text-red-800" },
};
function Rank({ v }: { v: string | null }) {
  const r = v ? RANK[v] : undefined;
  if (!r) return <span className="text-xs text-muted-foreground" title="Meta affiche les classements après ~500 impressions">—</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.cls}`}>{r.label}</span>;
}
const pct = (a: number, b: number) => (b > 0 ? (Math.round((a / b) * 1000) / 10).toFixed(1) + "%" : "—");
const n = (x: number | null) => (x == null ? "—" : x.toLocaleString("fr-FR"));

export function MetaLiveSection({
  live, codeByAd, rate, title = "Meta Ads Manager — en direct",
}: {
  live: { ok: true; ads: MetaLiveAd[]; fetchedAt: string } | { ok: false; error: string };
  codeByAd: Map<string, string>;
  rate: number;
  title?: string;
}) {
  const usd = (x: number | null) => (x == null ? "—" : `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const madOf = (x: number | null) => (x == null ? "" : `${Math.round(x * rate).toLocaleString("fr-FR")} MAD`);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const liveCols = [
    "Vidéo", "Pub", "Diffusion", "Paramètre d'attribution", "Résultats", "Coût par résultat", "Budget",
    "Montant dépensé", "Impressions", "Portée", "Fréquence", "Clics (tous)", "CTR (tous)", "Clics lien", "CTR lien", "CPC lien", "Hook rate", "Hold rate",
    "Fin", "Stratégie d'enchère", "Dernière modification", "Classement qualité", "Classement engagement",
    "Classement conversion", "Ensemble de pubs",
  ];
  return (
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">{title} ({live.ok ? live.ads.length : 0})</h2>
          {live.ok && <LiveRefresh fetchedAt={live.fetchedAt} />}
        </div>
        {!live.ok ? (
          <p className="px-4 py-4 text-sm text-red-600">Lecture Meta impossible : {live.error}. Les chiffres ci-dessous (synchro 15 min) restent disponibles.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>{liveCols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
              </thead>
              <tbody>
                {live.ads.length === 0 && (
                  <tr><td colSpan={liveCols.length} className="px-4 py-6 text-center text-muted-foreground">
                    Aucune pub Meta liée à tes vidéos.
                  </td></tr>
                )}
                {live.ads.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-mono font-semibold">{codeByAd.get(a.id) ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{a.name}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLS[a.delivery.tone]}`}>{a.delivery.label}</span></td>
                    <td className="px-3 py-2">{a.attribution}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-semibold">{a.results ?? "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{a.resultLabel}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div>{usd(a.costPerResultUsd)}</div>
                      <div className="text-[10px] text-muted-foreground">{madOf(a.costPerResultUsd)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {a.budget ? (<><div>{usd(a.budget.usd)}</div>
                        <div className="text-[10px] text-muted-foreground">{a.budget.kind} · {a.budget.level}</div></>) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-semibold">{usd(a.spendUsd)}</div>
                      <div className="text-[10px] text-muted-foreground">{madOf(a.spendUsd)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{n(a.impressions)}</td>
                    <td className="px-3 py-2 text-right">{n(a.reach)}</td>
                    <td className="px-3 py-2 text-right">{a.frequency ? a.frequency.toFixed(2) : "—"}</td>
                    <td className="px-3 py-2 text-right">{n(a.clicks)}</td>
                    <td className="px-3 py-2 text-right">{ctr(a.clicks, a.impressions)}</td>
                    <td className="px-3 py-2 text-right">{n(a.linkClicks)}</td>
                    <td className="px-3 py-2 text-right">{ctr(a.linkClicks, a.impressions)}</td>
                    <td className="px-3 py-2 text-right">
                      <div>{usd(a.linkClicks ? a.spendUsd / a.linkClicks : null)}</div>
                      <div className="text-[10px] text-muted-foreground">{madOf(a.linkClicks ? a.spendUsd / a.linkClicks : null)}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{pct(a.videoPlays, a.impressions)}</td>
                    <td className="px-3 py-2 text-right">{pct(a.thruplays, a.videoPlays)}</td>
                    <td className="px-3 py-2">{a.ends ? date(a.ends) : "En continu"}</td>
                    <td className="px-3 py-2">{a.bidStrategy}</td>
                    <td className="px-3 py-2">{date(a.lastEdit)}</td>
                    <td className="px-3 py-2"><Rank v={a.quality} /></td>
                    <td className="px-3 py-2"><Rank v={a.engagement} /></td>
                    <td className="px-3 py-2"><Rank v={a.conversion} /></td>
                    <td className="px-3 py-2">{a.adsetName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
  );
}
