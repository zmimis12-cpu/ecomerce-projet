import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMetaAdsLive, getAccountAdIds, getAccountLifetimeSpend } from "@/lib/ads/meta-live";
import { getUsdToMad } from "@/lib/ads/fx";
import { periodToRange } from "@/lib/creatives/queries";
import { PeriodFilter, currentMonth } from "@/components/creatives/period-filter";
import { MetaLiveSection } from "@/components/ads/meta-live-section";

export const metadata: Metadata = { title: "Stats pubs" };
export const dynamic = "force-dynamic";

export default async function AdminAdStatsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const sp = await searchParams;
  const period = sp.month ?? currentMonth();

  const [adIds, { data: links }, { data: creatives }, fx, lifetime] = await Promise.all([
    getAccountAdIds(),
    supabaseAdmin.from("creative_ads" as never).select("ad_id, creative_id").eq("platform", "meta"),
    supabaseAdmin.from("creatives" as never).select("id, code"),
    getUsdToMad(),
    getAccountLifetimeSpend(),
  ]);
  const codeOf = new Map(((creatives ?? []) as { id: string; code: string }[]).map((c) => [c.id, c.code]));
  const codeByAd = new Map(((links ?? []) as { ad_id: string; creative_id: string }[])
    .map((l) => [l.ad_id, codeOf.get(l.creative_id) ?? ""]));

  const live = await getMetaAdsLive(adIds, periodToRange(period));
  const ads = live.ok ? live.ads : [];
  const spend = ads.reduce((s, a) => s + a.spendUsd, 0);
  const results = ads.reduce((s, a) => s + (a.results ?? 0), 0);
  const impressions = ads.reduce((s, a) => s + a.impressions, 0);
  const clicks = ads.reduce((s, a) => s + a.linkClicks, 0);
  const cards = [
    { label: "Dépensé (période)", value: `$${spend.toFixed(2)}`, sub: `${Math.round(spend * fx.rate).toLocaleString("fr-FR")} MAD` },
    { label: "Résultats", value: results.toLocaleString("fr-FR"), sub: results ? `$${(spend / results).toFixed(2)} / résultat` : "—" },
    { label: "Impressions", value: impressions.toLocaleString("fr-FR"), sub: "" },
    { label: "Clics lien", value: clicks.toLocaleString("fr-FR"), sub: impressions ? `CTR ${((clicks / impressions) * 100).toFixed(2)} %` : "" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><BarChart3 className="h-5 w-5 text-blue-600" /> Stats pubs (toutes)</h1>
          <p className="mt-1 text-sm text-muted-foreground">Toutes les pubs de ton compte Meta, en direct, mêmes colonnes que Meta Ads Manager.</p>
        </div>
        <PeriodFilter period={period} />
      </div>
      {lifetime && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            Total dépensé depuis le début (all time)
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-bold text-blue-900">
              ${lifetime.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm text-blue-800">≈ {Math.round(lifetime.usd * fx.rate).toLocaleString("fr-FR")} MAD (taux {fx.rate})</span>
          </div>
          <div className="mt-0.5 text-xs text-blue-700">
            Compte publicitaire Meta, depuis le {lifetime.since ? new Date(lifetime.since).toLocaleDateString("fr-FR") : "—"} — toutes campagnes, y compris supprimées. Identique à Meta Ads Manager (période « Maximum »).
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 text-lg font-semibold">{c.value}</div>
            {c.sub && <div className="text-xs text-muted-foreground">{c.sub}</div>}
          </div>
        ))}
      </div>
      <MetaLiveSection live={live} codeByAd={codeByAd} rate={fx.rate} title="Toutes les pubs Meta — en direct" />
    </div>
  );
}
