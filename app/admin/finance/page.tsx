import type { Metadata } from "next";
import {
  TrendingUp, Truck, RotateCcw, DollarSign,
  AlertTriangle, Calendar, MapPin, Activity,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import {
  getDashboardSummary, getProductPerformance,
  getDailyFinance, getDeliveryClaims, getFinanceAnomalies,
} from "@/lib/dashboard/queries";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table";
import { FinanceChart } from "@/components/dashboard/finance-chart";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Finance" };
export const dynamic = "force-dynamic";

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  await requireRole(["super_admin","admin","manager","finance"]);
  const params = await searchParams;

  const period = params.period ?? "30";
  let filter = undefined;
  if (params.from && params.to) {
    filter = { from: params.from, to: params.to };
  } else {
    const days = parseInt(period, 10) || 30;
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    filter     = { from, to };
  }

  const [summary, products, daily, { claims, total: claimTotal }, anomalies] = await Promise.all([
    getDashboardSummary(filter),
    getProductPerformance(filter),
    getDailyFinance(parseInt(period, 10) || 30),
    getDeliveryClaims(),
    getFinanceAnomalies(20),
  ]);

  const periodLabels: Record<string, string> = {
    "1":"Aujourd'hui","7":"7 derniers jours","30":"30 derniers jours","90":"90 derniers jours",
  };
  const PERIODS = ["1","7","30","90"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Finance Réelle</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filter ? `${filter.from} → ${filter.to}` : "Toutes les périodes"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {PERIODS.map((p) => (
            <a key={p} href={`/admin/finance?period=${p}`}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}>
              {periodLabels[p]}
            </a>
          ))}
        </div>
      </div>

      {/* ── ANOMALIES ALERT ── */}
      {anomalies.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {anomalies.length} anomalie(s) financière(s) détectée(s)
            </span>
          </div>
          <div className="space-y-1">
            {anomalies.slice(0, 5).map((a) => (
              <p key={a.id} className="text-xs text-red-700">
                • {a.anomaly_type.replace(/_/g," ")} — {a.description} ({mad(Math.abs(a.difference))})
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── REAL REVENUE ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Revenus Réels</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="CA Réel (Payé)" value={mad(summary.real_revenue)}
            icon={DollarSign} variant="green" highlight />
          <KpiCard label="CA Estimé" value={mad(summary.estimated_revenue)}
            icon={DollarSign} />
          <KpiCard label="En attente paiement" value={mad(summary.pending_collection)}
            icon={AlertTriangle} variant="amber" sub="Livré non payé" />
          <KpiCard label="Taux Livraison" value={`${summary.delivery_rate}%`}
            icon={Truck} variant={summary.delivery_rate >= 70 ? "green" : "red"} />
        </div>
      </section>

      {/* ── REAL PROFIT ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Profit Réel</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Profit Réel" value={mad(summary.real_profit)}
            variant={summary.real_profit >= 0 ? "green" : "red"}
            icon={TrendingUp} highlight />
          <KpiCard label="Profit Estimé" value={mad(summary.estimated_profit)}
            icon={TrendingUp} />
          <KpiCard label="Marge Nette" value={`${summary.net_margin_pct}%`}
            variant={summary.net_margin_pct >= 20 ? "green" : summary.net_margin_pct >= 0 ? "amber" : "red"}
            sub="Profit / CA Réel" />
          <KpiCard label="ROI" value={`${summary.roi}%`}
            variant={summary.roi >= 30 ? "green" : summary.roi >= 0 ? "amber" : "red"}
            sub="Profit / COGS" />
        </div>
      </section>

      {/* ── DELIVERY MARGIN ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Livraison & Marges</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Marge Livraison Casa" value={mad(summary.total_delivery_margin)}
            icon={MapPin} variant="green"
            sub={`${summary.casa_orders_count} cmd Casa (+10 MAD chacune)`} />
          <KpiCard label="Surcharges Digylog" value={mad(summary.total_delivery_overcharge)}
            icon={AlertTriangle} variant={summary.total_delivery_overcharge > 0 ? "red" : "green"}
            sub="À réclamer à Digylog" />
          <KpiCard label="Coût Livraison Total" value={mad(summary.total_delivery_cost)}
            icon={Truck} />
          <KpiCard label="Pertes Retours" value={mad(summary.total_return_losses)}
            icon={RotateCcw} variant="red" />
        </div>
      </section>

      {/* ── STATUS FUNNEL ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Funnel Commandes</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            { label:"Leads",      val:summary.total_leads,            cls:"text-foreground" },
            { label:"Confirmés",  val:summary.confirmed_count,        cls:"text-blue-700" },
            { label:"Expédiés",   val:summary.sent_to_delivery_count, cls:"text-violet-700" },
            { label:"Livrés",     val:summary.delivered_count,        cls:"text-emerald-700" },
            { label:"Payés",      val:summary.paid_count,             cls:"text-green-700" },
            { label:"Retournés",  val:summary.returned_count,         cls:"text-red-600" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border bg-card p-4 text-center">
              <p className={`text-2xl font-bold ${k.cls}`}>{k.val}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CHARTS ── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <FinanceChart data={daily} metric="real_revenue" />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <FinanceChart data={daily} metric="real_profit" />
        </div>
      </section>

      {/* ── DELIVERY CLAIMS ── */}
      {claims.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Créances Transporteur
            </h2>
            <span className="text-sm font-bold text-amber-700">Total: {mad(claimTotal)}</span>
          </div>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-secondary/30">
                    {["N° Commande","Client","Tracking","Montant","Statut","Type","Date"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {claims.slice(0, 50).map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/20">
                      <td className="px-3 py-2.5 font-mono font-medium">{c.order_number}</td>
                      <td className="px-3 py-2.5">{c.customer_name}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.delivery_tracking_number ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-amber-700">{mad(c.claim_amount)}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">{c.status}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          c.claim_type === "pending_collection" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>
                          {c.claim_type === "pending_collection" ? "À collecter" : "Retour"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{new Date(c.updated_at).toLocaleDateString("fr-MA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ── PRODUCT PERFORMANCE ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Performance par Produit
        </h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          <ProductPerformanceTable data={products} />
        </div>
      </section>

      {/* ── DAILY TABLE ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Détail Journalier</h2>
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Date","Leads","Confirmés","Livrés","Retournés","CA Estimé","CA Réel","Profit Est.","Profit Réel"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {daily.slice(0, 30).map((d) => (
                  <tr key={d.day} className="hover:bg-secondary/20">
                    <td className="px-3 py-2.5 font-mono font-medium">{d.day}</td>
                    <td className="px-3 py-2.5 font-mono text-center">{d.leads}</td>
                    <td className="px-3 py-2.5 font-mono text-center text-blue-700">{d.confirmed}</td>
                    <td className="px-3 py-2.5 font-mono text-center text-green-700">{d.delivered}</td>
                    <td className="px-3 py-2.5 font-mono text-center text-red-600">{d.returned}</td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{d.estimated_revenue.toFixed(0)}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold">{d.real_revenue.toFixed(0)}</td>
                    <td className="px-3 py-2.5 font-mono text-muted-foreground">{d.estimated_profit.toFixed(0)}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${d.real_profit >= 0 ? "text-green-700" : "text-red-600"}`}>
                      {d.real_profit.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
