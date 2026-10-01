import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getEditorAdStats, ctr, getEditorLinkedAds, periodToRange } from "@/lib/creatives/queries";
import { getMetaAdsLive } from "@/lib/ads/meta-live";
import { getUsdToMad } from "@/lib/ads/fx";
import { MetaLiveSection } from "@/components/ads/meta-live-section";
import { EditorHeader } from "@/components/creatives/editor-sections";

export const metadata: Metadata = { title: "Stats pubs" };
export const dynamic = "force-dynamic";

const RANK: Record<string, { label: string; cls: string }> = {
  ABOVE_AVERAGE:            { label: "Au-dessus", cls: "bg-green-100 text-green-800" },
  AVERAGE:                  { label: "Moyen",     cls: "bg-gray-100 text-gray-700" },
  BELOW_AVERAGE_35:         { label: "Bas (35 %)", cls: "bg-amber-100 text-amber-800" },
  BELOW_AVERAGE_20:         { label: "Bas (20 %)", cls: "bg-orange-100 text-orange-800" },
  BELOW_AVERAGE_10:         { label: "Bas (10 %)", cls: "bg-red-100 text-red-800" },
};
const STATUS: Record<string, string> = {
  ACTIVE: "🟢 Active", PAUSED: "⏸️ En pause", ADSET_PAUSED: "⏸️ Ensemble en pause",
  CAMPAIGN_PAUSED: "⏸️ Campagne en pause", IN_PROCESS: "⏳ En traitement", PENDING_REVIEW: "⏳ En examen",
  DISAPPROVED: "⛔ Refusée", WITH_ISSUES: "⚠️ Problème", ARCHIVED: "Archivée", DELETED: "Supprimée",
};

function Rank({ v }: { v: string | null }) {
  const r = v ? RANK[v] : undefined;
  if (!r) return <span className="text-xs text-muted-foreground" title="Meta affiche les classements après ~500 impressions">—</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.cls}`}>{r.label}</span>;
}
const pct = (a: number, b: number) => (b > 0 ? (Math.round((a / b) * 1000) / 10).toFixed(1) + "%" : "—");
const n = (x: number | null) => (x == null ? "—" : x.toLocaleString("fr-FR"));

export default async function EditorAdsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const linked = await getEditorLinkedAds(ctx.editorId);
  const metaLinks = linked.filter((l) => l.platform === "meta");
  const codeByAd = new Map(linked.map((l) => [l.adId, l.code]));
  const [live, ads, fx] = await Promise.all([
    getMetaAdsLive(metaLinks.map((l) => l.adId), periodToRange(ctx.report.period)),
    getEditorAdStats({ editorId: ctx.editorId, month: ctx.report.period }),
    getUsdToMad(),
  ]);

  const cols = [
    "Vidéo", "Pub", "Diffusion", "Leads (Meta)", "Coût / lead", "Messages", "Impressions", "Portée*", "Fréquence*",
    "Clics lien", "CTR", "Vues page", "Checkouts", "Vues 3 s", "Hook rate", "ThruPlays", "Hold rate",
    "Qualité*", "Engagement*", "Conversion*",
  ];

  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title="Stats pubs" icon={BarChart3} current="/admin/editor/ads" />

      <MetaLiveSection live={live} codeByAd={codeByAd} rate={fx.rate} />

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Détail vidéo & engagement — synchro 15 min ({ads.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mêmes chiffres que Meta Ads Manager, sans les montants. * = cumul depuis le lancement de la pub.
            Hook rate = vues 3 s ÷ impressions · Hold rate = ThruPlays ÷ vues 3 s.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
              <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
            </thead>
            <tbody>
              {ads.length === 0 && (
                <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-muted-foreground">
                  Aucune pub liée à tes vidéos pour le moment.
                </td></tr>
              )}
              {ads.map((a) => (
                <tr key={a.platform + a.adId} className="border-t">
                  <td className="px-3 py-2 font-mono font-semibold">{a.creativeCode}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.adName}</div>
                    <div className="text-[10px] text-muted-foreground">{a.platform === "meta" ? "Meta" : "TikTok"}{a.adsetName ? ` · ${a.adsetName}` : ""}</div>
                  </td>
                  <td className="px-3 py-2">{a.status ? STATUS[a.status] ?? a.status : "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold">{a.leads}</td>
                  <td className="px-3 py-2 text-right">{a.leads > 0 ? `${Math.round(a.spend / a.leads)} MAD` : "—"}</td>
                  <td className="px-3 py-2 text-right">{a.messages}</td>
                  <td className="px-3 py-2 text-right">{n(a.impressions)}</td>
                  <td className="px-3 py-2 text-right">{n(a.reach)}</td>
                  <td className="px-3 py-2 text-right">{a.frequency != null ? a.frequency.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right">{n(a.linkClicks)}</td>
                  <td className="px-3 py-2 text-right">{ctr(a.linkClicks, a.impressions)}</td>
                  <td className="px-3 py-2 text-right">{n(a.landingPageViews)}</td>
                  <td className="px-3 py-2 text-right">{a.initiateCheckouts}</td>
                  <td className="px-3 py-2 text-right">{n(a.videoPlays)}</td>
                  <td className="px-3 py-2 text-right">{pct(a.videoPlays, a.impressions)}</td>
                  <td className="px-3 py-2 text-right">{n(a.thruplays)}</td>
                  <td className="px-3 py-2 text-right">{pct(a.thruplays, a.videoPlays)}</td>
                  <td className="px-3 py-2"><Rank v={a.qualityRanking} /></td>
                  <td className="px-3 py-2"><Rank v={a.engagementRanking} /></td>
                  <td className="px-3 py-2"><Rank v={a.conversionRanking} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
