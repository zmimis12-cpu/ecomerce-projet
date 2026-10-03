"use client";
/**
 * Tableau "Meta Ads Manager — en direct" avec filtres (campagne, ensemble,
 * diffusion, vidéo, recherche), tri, regroupement par campagne + sous-totaux.
 * Partagé : page admin "Stats pubs" et espace éditeur.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { LiveRefresh } from "@/components/creatives/live-refresh";
import type { MetaLiveAd } from "@/lib/ads/meta-live";

const TONE: Record<string, string> = {
  green: "bg-green-100 text-green-800", blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", gray: "bg-gray-100 text-gray-600",
};
const RANK: Record<string, { label: string; cls: string }> = {
  ABOVE_AVERAGE:    { label: "Au-dessus", cls: "bg-green-100 text-green-800" },
  AVERAGE:          { label: "Moyen",     cls: "bg-gray-100 text-gray-700" },
  BELOW_AVERAGE_35: { label: "Bas (35 %)", cls: "bg-amber-100 text-amber-800" },
  BELOW_AVERAGE_20: { label: "Bas (20 %)", cls: "bg-orange-100 text-orange-800" },
  BELOW_AVERAGE_10: { label: "Bas (10 %)", cls: "bg-red-100 text-red-800" },
};
function Rank({ v }: { v: string | null }) {
  const r = v ? RANK[v] : undefined;
  if (!r) return <span className="text-muted-foreground" title="Meta affiche les classements après ~500 impressions">—</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.cls}`}>{r.label}</span>;
}
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(2) + " %" : "—");
const n = (x: number | null) => (x == null ? "—" : x.toLocaleString("fr-FR"));

type SortKey = "spend" | "results" | "cpr" | "ctr" | "impressions" | "name";
const LIVE_STATES = ["ACTIVE", "LEARNING", "LEARNING_LIMITED", "WITH_ISSUES"];

export function MetaLiveSection({
  live, codeByAd, rate, title = "Meta Ads Manager — en direct", showTotals = false,
}: {
  live: { ok: true; ads: MetaLiveAd[]; fetchedAt: string } | { ok: false; error: string };
  codeByAd: Record<string, string>;
  rate: number;
  title?: string;
  showTotals?: boolean;
}) {
  const ads = live.ok ? live.ads : [];
  const [q, setQ] = useState("");
  const [campaign, setCampaign] = useState("");
  const [account, setAccount] = useState("");
  const accountNames = useMemo(() => [...new Set(ads.map((a) => a.accountLabel).filter(Boolean))] as string[], [ads]);
  const [adset, setAdset] = useState("");
  const [delivery, setDelivery] = useState<"all" | "live" | "off" | "issues">("all");
  const [video, setVideo] = useState<"all" | "linked" | "unlinked">("all");
  const [onlySpend, setOnlySpend] = useState(true);
  const [sort, setSort] = useState<SortKey>("spend");
  const [group, setGroup] = useState(true);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const campaigns = useMemo(() => [...new Map(ads.filter((a) => a.campaignId).map((a) => [a.campaignId!, a.campaignName ?? a.campaignId!])).entries()]
    .sort((x, y) => x[1].localeCompare(y[1])), [ads]);
  const adsets = useMemo(() => [...new Map(ads.filter((a) => a.adsetId && (!campaign || a.campaignId === campaign))
    .map((a) => [a.adsetId!, a.adsetName ?? a.adsetId!])).entries()], [ads, campaign]);

  const usd = (x: number | null) => (x == null ? "—" : `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const madOf = (x: number | null) => (x == null ? "" : `${Math.round(x * rate).toLocaleString("fr-FR")} MAD`);
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Africa/Casablanca", day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = ads.filter((a) => {
      if (account && a.accountLabel !== account) return false;
      if (campaign && a.campaignId !== campaign) return false;
      if (adset && a.adsetId !== adset) return false;
      if (onlySpend && a.spendUsd === 0 && a.impressions === 0) return false;
      const k = a.delivery.key;
      if (delivery === "live" && !LIVE_STATES.includes(k)) return false;
      if (delivery === "off" && LIVE_STATES.includes(k)) return false;
      if (delivery === "issues" && !["WITH_ISSUES", "DISAPPROVED", "BILLING", "LEARNING_LIMITED"].includes(k)) return false;
      const code = codeByAd[a.id];
      if (video === "linked" && !code) return false;
      if (video === "unlinked" && code) return false;
      if (t && ![a.name, a.adsetName ?? "", a.campaignName ?? "", code ?? ""].some((x) => x.toLowerCase().includes(t))) return false;
      return true;
    });
    const cpr = (a: MetaLiveAd) => a.costPerResultUsd ?? Infinity;
    const ctrOf = (a: MetaLiveAd) => (a.impressions ? a.linkClicks / a.impressions : 0);
    return list.sort((x, y) => {
      switch (sort) {
        case "results": return (y.results ?? 0) - (x.results ?? 0);
        case "cpr": return cpr(x) - cpr(y);
        case "ctr": return ctrOf(y) - ctrOf(x);
        case "impressions": return y.impressions - x.impressions;
        case "name": return x.name.localeCompare(y.name);
        default: return y.spendUsd - x.spendUsd;
      }
    });
  }, [ads, q, account, campaign, adset, delivery, video, onlySpend, sort, codeByAd]);

  const sum = (list: MetaLiveAd[]) => {
    const spend = list.reduce((s, a) => s + a.spendUsd, 0);
    const results = list.reduce((s, a) => s + (a.results ?? 0), 0);
    const imp = list.reduce((s, a) => s + a.impressions, 0);
    const clicks = list.reduce((s, a) => s + a.linkClicks, 0);
    return { spend, results, imp, clicks, cpr: results ? spend / results : null };
  };
  const total = sum(filtered);

  const groups = useMemo(() => {
    if (!group) return [{ key: "_all", name: "", account: "", items: filtered }];
    const m = new Map<string, { key: string; name: string; account: string; items: MetaLiveAd[] }>();
    for (const a of filtered) {
      const k = `${a.accountLabel ?? ""}::${a.campaignId ?? "_none"}`;
      if (!m.has(k)) m.set(k, { key: k, name: a.campaignName ?? "Sans campagne", account: a.accountLabel ?? "", items: [] });
      m.get(k)!.items.push(a);
    }
    // Trié par compte, puis par dépense
    return [...m.values()].sort((x, y) => x.account.localeCompare(y.account) || sum(y.items).spend - sum(x.items).spend);
  }, [filtered, group]);

  const cols = [
    "Vidéo", "Pub", "Diffusion", "Résultats", "Coût / résultat", "Budget", "Montant dépensé",
    "Impressions", "Portée", "Fréquence", "Clics (tous)", "CTR (tous)", "Clics lien", "CTR lien", "CPC lien",
    "Hook rate", "Hold rate", "Attribution", "Fin", "Enchère", "Modifiée le",
    "Qualité", "Engagement", "Conversion", "Ensemble de pubs",
  ];
  const SEL = "h-9 rounded-md border bg-background px-2 text-sm";

  return (
    <section className="space-y-3">
      {showTotals && live.ok && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Dépensé (filtre)", value: usd(total.spend), sub: madOf(total.spend) },
            { label: "Résultats", value: n(total.results), sub: total.cpr ? `${usd(total.cpr)} / résultat · ${madOf(total.cpr)}` : "—" },
            { label: "Impressions", value: n(total.imp), sub: `${filtered.length} pub(s)` },
            { label: "Clics lien", value: n(total.clicks), sub: total.imp ? `CTR ${pct(total.clicks, total.imp)}` : "" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-4">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-lg font-semibold">{c.value}</div>
              {c.sub && <div className="text-xs text-muted-foreground">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">{title} <span className="text-muted-foreground">({filtered.length} / {ads.length})</span></h2>
          {live.ok && <LiveRefresh fetchedAt={live.fetchedAt} />}
        </div>

        {/* ── Barre de filtres ── */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className={SEL + " w-56 pl-8"} placeholder="Rechercher pub, ensemble, V001…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {accountNames.length > 0 && (
            <select className={SEL} value={account} onChange={(e) => { setAccount(e.target.value); setCampaign(""); setAdset(""); }}>
              <option value="">Tous les comptes Meta</option>
              {accountNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <select className={SEL} value={campaign} onChange={(e) => { setCampaign(e.target.value); setAdset(""); }}>
            <option value="">Toutes les campagnes</option>
            {campaigns.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className={SEL} value={adset} onChange={(e) => setAdset(e.target.value)}>
            <option value="">Tous les ensembles</option>
            {adsets.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className={SEL} value={delivery} onChange={(e) => setDelivery(e.target.value as typeof delivery)}>
            <option value="all">Toutes diffusions</option>
            <option value="live">🟢 Actives seulement</option>
            <option value="off">⚪ Désactivées</option>
            <option value="issues">⚠️ Problèmes / limitées</option>
          </select>
          <select className={SEL} value={video} onChange={(e) => setVideo(e.target.value as typeof video)}>
            <option value="all">Toutes (vidéo)</option>
            <option value="linked">Liées à une vidéo</option>
            <option value="unlinked">Non liées</option>
          </select>
          <select className={SEL} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="spend">Trier : dépense ↓</option>
            <option value="results">Trier : résultats ↓</option>
            <option value="cpr">Trier : coût / résultat ↑ (moins cher)</option>
            <option value="ctr">Trier : CTR ↓</option>
            <option value="impressions">Trier : impressions ↓</option>
            <option value="name">Trier : nom A→Z</option>
          </select>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={onlySpend} onChange={(e) => setOnlySpend(e.target.checked)} /> Masquer sans diffusion</label>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Grouper par compte › campagne</label>
          {(q || campaign || adset || delivery !== "all" || video !== "all") && (
            <button className="text-xs text-primary hover:underline"
              onClick={() => { setQ(""); setCampaign(""); setAdset(""); setDelivery("all"); setVideo("all"); }}>Réinitialiser</button>
          )}
        </div>

        {!live.ok ? (
          <p className="px-4 py-4 text-sm text-red-600">Lecture Meta impossible : {live.error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead className="sticky top-0 bg-muted/60 text-left text-[11px] text-muted-foreground">
                <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-muted-foreground">Aucune pub pour ces filtres.</td></tr>
                )}
                {groups.map((g, gi) => {
                  const st = sum(g.items);
                  const isClosed = closed[g.key];
                  const newAccount = group && !!g.account && (gi === 0 || groups[gi - 1].account !== g.account);
                  const accItems = filtered.filter((a) => a.accountLabel === g.account);
                  const accSum = sum(accItems);
                  return (
                    <FragmentRows key={g.key}>
                      {newAccount && (
                        <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                          <td className="px-3 py-2" colSpan={3}>🏢 Compte : {g.account}</td>
                          <td className="px-3 py-2 text-right">{n(accSum.results)}</td>
                          <td className="px-3 py-2 text-right">{usd(accSum.cpr)}</td>
                          <td />
                          <td className="px-3 py-2 text-right">{usd(accSum.spend)}<div className="text-[10px] font-normal text-muted-foreground">{madOf(accSum.spend)}</div></td>
                          <td className="px-3 py-2 text-right">{n(accSum.imp)}</td>
                          <td colSpan={cols.length - 8} className="px-3 py-2 text-xs font-normal text-muted-foreground">{accItems.length} pub(s)</td>
                        </tr>
                      )}
                      {group && (
                        <tr className="cursor-pointer border-t bg-blue-50/60 font-semibold hover:bg-blue-50"
                          onClick={() => setClosed((c) => ({ ...c, [g.key]: !c[g.key] }))}>
                          <td className="px-3 py-2" colSpan={3}>
                            <span className="inline-flex items-center gap-1">
                              {isClosed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              📁 {g.name} <span className="font-normal text-muted-foreground">({g.items.length} pub{g.items.length > 1 ? "s" : ""})</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{n(st.results)}</td>
                          <td className="px-3 py-2 text-right">{usd(st.cpr)}<div className="text-[10px] font-normal text-muted-foreground">{madOf(st.cpr)}</div></td>
                          <td />
                          <td className="px-3 py-2 text-right">{usd(st.spend)}<div className="text-[10px] font-normal text-muted-foreground">{madOf(st.spend)}</div></td>
                          <td className="px-3 py-2 text-right">{n(st.imp)}</td>
                          <td colSpan={4} />
                          <td className="px-3 py-2 text-right">{n(st.clicks)}</td>
                          <td className="px-3 py-2 text-right">{pct(st.clicks, st.imp)}</td>
                          <td colSpan={cols.length - 14} />
                        </tr>
                      )}
                      {!isClosed && g.items.map((a) => (
                        <tr key={a.id} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono font-semibold">{codeByAd[a.id] || "—"}</td>
                          <td className="px-3 py-2 font-medium">{a.name}{!group && a.accountLabel && <div className="text-[10px] font-normal text-muted-foreground">{a.accountLabel}</div>}</td>
                          <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE[a.delivery.tone]}`}>{a.delivery.label}</span></td>
                          <td className="px-3 py-2 text-right">
                            <div className="font-semibold">{a.results ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{a.resultLabel}</div>
                          </td>
                          <td className="px-3 py-2 text-right"><div>{usd(a.costPerResultUsd)}</div><div className="text-[10px] text-muted-foreground">{madOf(a.costPerResultUsd)}</div></td>
                          <td className="px-3 py-2 text-right">
                            {a.budget ? (<><div>{usd(a.budget.usd)}</div><div className="text-[10px] text-muted-foreground">{a.budget.kind} · {a.budget.level}</div></>) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right"><div className="font-semibold">{usd(a.spendUsd)}</div><div className="text-[10px] text-muted-foreground">{madOf(a.spendUsd)}</div></td>
                          <td className="px-3 py-2 text-right">{n(a.impressions)}</td>
                          <td className="px-3 py-2 text-right">{n(a.reach)}</td>
                          <td className="px-3 py-2 text-right">{a.frequency ? a.frequency.toFixed(2) : "—"}</td>
                          <td className="px-3 py-2 text-right">{n(a.clicks)}</td>
                          <td className="px-3 py-2 text-right">{pct(a.clicks, a.impressions)}</td>
                          <td className="px-3 py-2 text-right">{n(a.linkClicks)}</td>
                          <td className="px-3 py-2 text-right">{pct(a.linkClicks, a.impressions)}</td>
                          <td className="px-3 py-2 text-right"><div>{usd(a.linkClicks ? a.spendUsd / a.linkClicks : null)}</div><div className="text-[10px] text-muted-foreground">{madOf(a.linkClicks ? a.spendUsd / a.linkClicks : null)}</div></td>
                          <td className="px-3 py-2 text-right">{pct(a.videoPlays, a.impressions)}</td>
                          <td className="px-3 py-2 text-right">{pct(a.thruplays, a.videoPlays)}</td>
                          <td className="px-3 py-2">{a.attribution}</td>
                          <td className="px-3 py-2">{a.ends ? date(a.ends) : "En continu"}</td>
                          <td className="px-3 py-2">{a.bidStrategy}</td>
                          <td className="px-3 py-2">{date(a.lastEdit)}</td>
                          <td className="px-3 py-2"><Rank v={a.quality} /></td>
                          <td className="px-3 py-2"><Rank v={a.engagement} /></td>
                          <td className="px-3 py-2"><Rank v={a.conversion} /></td>
                          <td className="px-3 py-2">{a.adsetName ?? "—"}</td>
                        </tr>
                      ))}
                    </FragmentRows>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
