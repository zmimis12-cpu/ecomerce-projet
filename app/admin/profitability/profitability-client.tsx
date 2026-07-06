"use client";

import { useState, useEffect, useRef } from "react";
import type { DashboardSummary, ProductPerformance } from "@/lib/dashboard/queries";

interface Props {
  summary: DashboardSummary;
  products: ProductPerformance[];
}

const BUDGETS = [100, 250, 500, 1000, 5000, 10000];

function fmt(n: number) {
  return Math.round(n).toLocaleString("fr-MA") + " MAD";
}
function pct(n: number) {
  return (Math.round(n * 10) / 10) + "%";
}

export function ProfitabilityClient({ summary, products }: Props) {
  const topProduct = products[0];

  const [sell, setSell]         = useState(topProduct?.sale_price_mad ?? 499);
  const [buy, setBuy]           = useState((topProduct?.total_cost_mad ?? 410) - (topProduct?.ads_cost_mad ?? 0));
  const [charges, setCharges]   = useState(50);
  const [delivFee, setDelivFee] = useState(35);
  const [retFee, setRetFee]     = useState(15);
  const [confFee, setConfFee]   = useState(3);
  const [ads, setAds]           = useState(topProduct?.ads_total ?? 0);
  const [clicks, setClicks]     = useState(0);
  const [leads, setLeads]       = useState(topProduct?.lead_count ?? 0);
  const [confirmed, setConfirmed] = useState(topProduct?.confirmed_count ?? 0);
  const [shipped, setShipped]   = useState(topProduct?.confirmed_count ?? 0);
  const [delivered, setDelivered] = useState(topProduct?.delivered_count ?? 0);
  const [returned, setReturned] = useState(topProduct?.returned_count ?? 0);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<unknown>(null);

  const marge          = sell - buy - charges - delivFee;
  const conf_rate      = leads > 0 ? confirmed / leads : 0.8;
  const ship_rate      = confirmed > 0 ? shipped / confirmed : 0.95;
  const del_rate       = shipped > 0 ? delivered / shipped : 0.85;
  const ret_rate       = delivered > 0 ? returned / delivered : 0;
  const lp_rate        = clicks > 0 ? leads / clicks : 0.1;

  const rev            = delivered * sell;
  const cogs           = delivered * (buy + charges + delivFee) + returned * retFee + confirmed * confFee;
  const profit         = rev - cogs - ads;
  const roi            = ads > 0 ? (profit / ads) * 100 : 0;
  const roas           = ads > 0 ? rev / ads : 0;
  const margin         = rev > 0 ? (profit / rev) * 100 : 0;
  const ppo            = delivered > 0 ? profit / delivered : 0;

  const cpl            = leads > 0 ? ads / leads : 0;
  const cpc            = clicks > 0 ? ads / clicks : 0;
  const ctr            = clicks > 0 ? (leads / clicks) * 100 : 0;
  const cpaconf        = confirmed > 0 ? ads / confirmed : 0;
  const cpad           = delivered > 0 ? ads / delivered : 0;
  const break_roas     = sell > 0 ? (buy + charges + delivFee) / sell : 0;

  const cpa_be         = marge * del_rate;
  const cpa_target     = cpa_be * 0.75;
  const cpa_ideal      = cpa_be * 0.50;

  const daily_cpl      = cpl > 0 ? cpl : 20;
  const rec_budget     = cpa_target * (1 / (del_rate > 0 ? del_rate : 0.85)) * (conf_rate > 0 ? conf_rate : 0.8);
  const max_budget     = cpa_be * (1 / (del_rate > 0 ? del_rate : 0.85)) * (conf_rate > 0 ? conf_rate : 0.8);

  // Health score
  const conf_pct = conf_rate * 100;
  const del_pct  = del_rate * 100;
  let health: "green" | "amber" | "red";
  let healthText: string;
  if (conf_pct >= 85 && del_pct >= 85 && cpad <= cpa_ideal) {
    health = "green";
    healthText = "Excellent — confirmation >85%, livraison >85%, CPA optimal";
  } else if (conf_pct >= 75 && del_pct >= 70 && cpad <= cpa_be) {
    health = "amber";
    healthText = `Warning — livraison ${Math.round(del_pct)}%, CPA ${fmt(cpad)} vs cible ${fmt(cpa_target)}`;
  } else {
    health = "red";
    healthText = `Danger — livraison ${Math.round(del_pct)}%, CPA ${fmt(cpad)} dépasse break-even ${fmt(cpa_be)}`;
  }

  const healthColors = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red:   "bg-red-50 text-red-700 border-red-200",
  };

  useEffect(() => {
    if (!chartRef.current) return;
    // @ts-ignore
    if (window.Chart) {
      // @ts-ignore
      if (chartInst.current) chartInst.current.destroy();
      const chartRevs: number[] = [];
      const chartProfits: number[] = [];
      const chartLabels: string[] = [];
      BUDGETS.forEach(b => {
        const pl = daily_cpl > 0 ? b / daily_cpl : b / 20;
        const pc = Math.round(pl * conf_rate);
        const ps = Math.round(pc * ship_rate);
        const pd = Math.round(ps * del_rate);
        const pr = Math.round(pd * ret_rate);
        const prev = pd * sell;
        const pcogs = pd * (buy + charges + delivFee) + pr * retFee + pc * confFee;
        const ppr = prev - pcogs - b;
        chartRevs.push(prev);
        chartProfits.push(ppr);
        chartLabels.push(b.toLocaleString());
      });
      // @ts-ignore
      chartInst.current = new window.Chart(chartRef.current, {
        type: "bar",
        data: {
          labels: chartLabels,
          datasets: [
            { label: "Revenu", data: chartRevs, backgroundColor: "#2a78d6", borderRadius: 4 },
            { label: "Profit net", data: chartProfits, backgroundColor: "#1baf7a", borderRadius: 4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { callback: (v: number) => Math.round(v).toLocaleString(), font: { size: 10 } }, grid: { color: "rgba(128,128,128,0.08)" } },
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          },
        },
      });
    }
  });

  const InputField = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
      />
    </div>
  );

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="flex justify-between items-center py-1.5 border-b border-border last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color ?? ""}`}>{value}</span>
    </div>
  );

  const KPI = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
    <div className="bg-card rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-medium leading-none ${color ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Moteur de rentabilité</h1>
        <p className="text-muted-foreground text-sm mt-1">Analyse complète basée sur tes données réelles des 30 derniers jours</p>
      </div>

      {/* Health Score */}
      <div className={`rounded-xl border px-5 py-3 text-sm font-medium ${healthColors[health]}`}>
        {health === "green" ? "✅" : health === "amber" ? "⚠️" : "❌"} {healthText}
      </div>

      {/* Product selector */}
      {products.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {products.map(p => (
            <button
              key={p.product_id}
              onClick={() => {
                setSell(p.sale_price_mad);
                setBuy(p.total_cost_mad - p.ads_cost_mad);
                setAds(p.ads_total);
                setLeads(p.lead_count);
                setConfirmed(p.confirmed_count);
                setShipped(p.confirmed_count);
                setDelivered(p.delivered_count);
                setReturned(p.returned_count);
              }}
              className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-accent transition-colors"
            >
              {p.product_name}
            </button>
          ))}
        </div>
      )}

      {/* Settings */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium mb-3">Paramètres</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InputField label="Prix vente (MAD)" value={sell} onChange={setSell} />
          <InputField label="Prix achat (MAD)" value={buy} onChange={setBuy} />
          <InputField label="Charges fixes (MAD)" value={charges} onChange={setCharges} />
          <InputField label="Frais livraison (MAD)" value={delivFee} onChange={setDelivFee} />
          <InputField label="Coût retour (MAD)" value={retFee} onChange={setRetFee} />
          <InputField label="Coût confirmation (MAD)" value={confFee} onChange={setConfFee} />
          <InputField label="Dépenses Meta (MAD)" value={ads} onChange={setAds} />
          <InputField label="Clics Meta" value={clicks} onChange={setClicks} />
          <InputField label="Leads" value={leads} onChange={setLeads} />
          <InputField label="Confirmés" value={confirmed} onChange={setConfirmed} />
          <InputField label="Expédiés" value={shipped} onChange={setShipped} />
          <InputField label="Livrés" value={delivered} onChange={setDelivered} />
          <InputField label="Retours" value={returned} onChange={setReturned} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI label="Revenu réel" value={fmt(rev)} sub="Livrées × prix" />
        <KPI label="Profit net" value={fmt(profit)} sub="Après toutes charges"
          color={profit > 0 ? "text-green-600" : profit < 0 ? "text-red-600" : "text-amber-600"} />
        <KPI label="ROI" value={Math.round(roi) + "%"} sub="Profit / Ads"
          color={roi > 0 ? "text-green-600" : "text-red-600"} />
        <KPI label="ROAS" value={(Math.round(roas * 10) / 10) + "x"} sub="Revenu / Ads" />
        <KPI label="Marge nette" value={pct(margin)} sub="Profit / Revenu"
          color={margin > 0 ? "text-green-600" : "text-red-600"} />
        <KPI label="Profit / livré" value={fmt(ppo)} sub="Net par commande"
          color={ppo > 0 ? "text-green-600" : "text-red-600"} />
        <KPI label="CPA réel" value={fmt(cpad)} sub="Ads / livrées"
          color={cpad <= cpa_target ? "text-green-600" : cpad <= cpa_be ? "text-amber-600" : "text-red-600"} />
        <KPI label="CPL" value={fmt(cpl)} sub="Ads / leads" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Funnel */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium mb-3">Funnel complet</h2>
          {[
            { label: "Clics", val: clicks, rate: null },
            { label: "Leads", val: leads, rate: lp_rate },
            { label: "Confirmés", val: confirmed, rate: conf_rate },
            { label: "Expédiés", val: shipped, rate: ship_rate },
            { label: "Livrés", val: delivered, rate: del_rate },
            { label: "Retours", val: returned, rate: ret_rate },
          ].map((s, i) => (
            <div key={i}>
              {i > 0 && <div className="text-xs text-muted-foreground text-center my-1 ml-4">↓</div>}
              <div className="flex items-center gap-3 bg-background rounded-lg px-3 py-2">
                <span className="text-base font-medium min-w-12 text-right">{Math.round(s.val).toLocaleString()}</span>
                <span className="text-sm text-muted-foreground flex-1">{s.label}</span>
                {s.rate !== null && (
                  <span className={`text-xs font-medium ${s.rate >= 0.8 ? "text-green-600" : s.rate >= 0.6 ? "text-amber-600" : "text-red-600"}`}>
                    {pct(s.rate * 100)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CPA corrigés */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-medium mb-3">CPA — formules COD correctes</h2>
            <Row label="Marge avant ads" value={fmt(marge)} />
            <Row label="CPA Break-even (marge × livr%)" value={fmt(cpa_be)} color="text-red-600" />
            <Row label="CPA cible (×0.75)" value={fmt(cpa_target)} color="text-amber-600" />
            <Row label="CPA idéal (×0.50)" value={fmt(cpa_ideal)} color="text-green-600" />
            <Row label="Ton CPA actuel" value={fmt(cpad)}
              color={cpad <= cpa_ideal ? "text-green-600" : cpad <= cpa_be ? "text-amber-600" : "text-red-600"} />
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <h2 className="text-sm font-medium mb-3">Scaling</h2>
            <Row label="Budget max/jour" value={fmt(max_budget) + "/j"} color="text-red-600" />
            <Row label="Budget recommandé/jour" value={fmt(rec_budget) + "/j"} color="text-green-600" />
            <Row label="Scaling sécurisé" value={fmt(rec_budget * 1.5) + "/j"} color="text-amber-600" />
            <Row label="Scaling agressif" value={fmt(max_budget * 0.8) + "/j"} color="text-red-600" />
            <Row label="Break-even ROAS" value={(Math.round(break_roas * 100) / 100) + "x"} />
          </div>
        </div>
      </div>

      {/* Projection */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium mb-3">Projection — funnel complet</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                {["Budget","Leads","Confirmés","Expédiés","Livrés","Retours","Revenu","Profit net","ROI","ROAS"].map(h => (
                  <th key={h} className="text-right py-2 px-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BUDGETS.map(b => {
                const pl = daily_cpl > 0 ? b / daily_cpl : b / 20;
                const pc = Math.round(pl * conf_rate);
                const ps = Math.round(pc * ship_rate);
                const pd = Math.round(ps * del_rate);
                const pr = Math.round(pd * ret_rate);
                const prev = pd * sell;
                const pcogs = pd * (buy + charges + delivFee) + pr * retFee + pc * confFee;
                const ppr = prev - pcogs - b;
                const proi = b > 0 ? Math.round((ppr / b) * 100) : 0;
                const proas = b > 0 ? Math.round((prev / b) * 10) / 10 : 0;
                return (
                  <tr key={b} className="border-b border-border last:border-0">
                    <td className="py-2 px-2 text-right font-medium">{b.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right">{Math.round(pl)}</td>
                    <td className="py-2 px-2 text-right">{pc}</td>
                    <td className="py-2 px-2 text-right">{ps}</td>
                    <td className="py-2 px-2 text-right">{pd}</td>
                    <td className="py-2 px-2 text-right">{pr}</td>
                    <td className="py-2 px-2 text-right">{Math.round(prev).toLocaleString()}</td>
                    <td className={`py-2 px-2 text-right font-medium ${ppr >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {ppr >= 0 ? "+" : ""}{Math.round(ppr).toLocaleString()}
                    </td>
                    <td className={`py-2 px-2 text-right ${proi >= 0 ? "text-green-600" : "text-red-600"}`}>{proi}%</td>
                    <td className="py-2 px-2 text-right">{proas}x</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block"></span>Revenu</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-600 inline-block"></span>Profit net</span>
        </div>
        <div className="relative w-full h-52">
          <canvas ref={chartRef} aria-label="Revenu et profit selon le budget">Projection revenu et profit.</canvas>
        </div>
      </div>

      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" async></script>
    </div>
  );
}
