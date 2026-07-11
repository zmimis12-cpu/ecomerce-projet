import type { Metadata } from "next";
import {
  ShoppingCart, CheckCircle, Truck, RotateCcw,
  DollarSign, TrendingUp, AlertTriangle, Send, Package,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import {
  getDashboardSummary, getProductPerformance, getDailyFinance,
} from "@/lib/dashboard/queries";
import { KpiCard, RateBadge } from "@/components/dashboard/kpi-card";
import { StoreFilter } from "@/components/shared/store-filter";
import { getStoreOptions } from "@/lib/delivery/store-filter-helper";
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table";
import { FinanceChart } from "@/components/dashboard/finance-chart";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session        = await requireRole([
    "super_admin","admin","manager","finance","call_center_agent","scanner_agent"
  ]);
  const canSeeFinance  = hasRole(session.role, ["super_admin","admin","manager","finance"]);
  const sp             = await searchParams;
  const storeId        = sp.store || undefined;
  const filter         = storeId ? { from: "2020-01-01", to: "2099-12-31", storeId } : undefined;

  const [summary, products, daily, storeOptions] = await Promise.all([
    canSeeFinance ? getDashboardSummary(filter) : null,
    canSeeFinance ? getProductPerformance(filter) : null,
    canSeeFinance ? getDailyFinance(14, storeId) : null,
    getStoreOptions(),
  ]);

  // ── Store filter indicator for title
  const selectedStore = storeOptions.find(s => s.id === storeId);

  // ── Alerts ────────────────────────────────────────────────────────────────────
  const alerts: { type: "warn"|"danger"; text: string }[] = [];
  if (summary) {
    if (summary.delivery_rate < 30)
      alerts.push({ type:"danger", text:`Taux de livraison critique: ${summary.delivery_rate.toFixed(1)}%` });
    else if (summary.delivery_rate < 50)
      alerts.push({ type:"warn",   text:`Taux de livraison bas: ${summary.delivery_rate.toFixed(1)}%` });
    if (summary.real_profit < 0)
      alerts.push({ type:"danger", text:`Profit réel négatif: ${mad(summary.real_profit)}` });
    if (summary.returned_count > 0 && summary.delivered_count > 0) {
      const returnRate = summary.returned_count / summary.delivered_count * 100;
      if (returnRate > 20)
        alerts.push({ type:"warn", text:`Taux de retour élevé: ${returnRate.toFixed(1)}%` });
    }
    if (summary.pending_collection > 0)
      alerts.push({ type:"warn",  text:`${mad(summary.pending_collection)} à collecter auprès du transporteur` });
  }

  // ── Extra KPIs from DB — sent_to_delivery count ───────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bonjour <span className="font-medium">{session.displayName}</span> —{" "}
          {new Date().toLocaleDateString("fr-MA", { weekday:"long", day:"numeric", month:"long" })}
        </p>
      </div>

      {/* Restricted view */}
      {!canSeeFinance && (
        <div className="rounded-xl border bg-card p-6 text-center space-y-2">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
          <p className="font-semibold">Accès limité</p>
          <p className="text-sm text-muted-foreground">
            Accédez à votre file d&apos;attente via le menu Call Center.
          </p>
        </div>
      )}

      {canSeeFinance && summary && (
        <>
          {/* ── ALERTS ── */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                  a.type === "danger"
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}>
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {a.text}
                </div>
              ))}
            </div>
          )}

          {/* ── FUNNEL ── */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Funnel commandes
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <KpiCard label="Leads"          value={summary.total_leads.toLocaleString()}
                icon={ShoppingCart} />
              <KpiCard label="Confirmés"       value={summary.confirmed_count.toLocaleString()}
                icon={CheckCircle} variant="blue"
                sub={`${summary.confirmation_rate.toFixed(1)}% taux conf.`} />
              <KpiCard label="Expédiés"        value={summary.sent_to_delivery_count.toLocaleString()}
                icon={Send} variant="blue" />
              <KpiCard label="En transit"      value={summary.in_transit_count.toLocaleString()}
                icon={Truck} variant="blue" />
              <KpiCard label="Livrés"          value={summary.delivered_count.toLocaleString()}
                icon={Package} variant="green"
                sub={`${summary.delivery_rate.toFixed(1)}% taux livr.`} />
              <KpiCard label="Payés"           value={summary.paid_count.toLocaleString()}
                icon={DollarSign} variant="green" />
              <KpiCard label="Retours"         value={summary.returned_count.toLocaleString()}
                icon={RotateCcw} variant={summary.returned_count > 0 ? "red" : "default"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RateBadge rate={summary.confirmation_rate} label="Taux de Confirmation" threshold={50} />
              <RateBadge rate={summary.delivery_rate}     label="Taux de Livraison"    threshold={70} />
            </div>
          </section>

          {/* ── FINANCE ── */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Finance réelle
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="CA Estimé"       value={mad(summary.estimated_revenue)}
                icon={DollarSign} />
              <KpiCard label="CA Réel Collecté" value={mad(summary.real_revenue)}
                icon={TrendingUp} variant="green" highlight
                sub="Commandes marquées payées" />
              <KpiCard label="À Collecter"     value={mad(summary.pending_collection)}
                icon={AlertTriangle} variant="amber"
                sub="Livrées non payées" />
              <KpiCard label="Net à Recevoir"   value={mad((summary as {net_a_recevoir?:number}).net_a_recevoir ?? 0)}
                icon={AlertTriangle} variant="green"
                sub="Après frais livraison (Casa 20 / Autres 35)" />
              <KpiCard label="Net Collecté"     value={mad((summary as {net_collected?:number}).net_collected ?? 0)}
                icon={TrendingUp} variant="green" highlight
                sub="Payé par Digylog, net des frais de livraison" />
              <KpiCard label="Profit Estimé"   value={mad(summary.estimated_profit)}
                icon={TrendingUp} />
              <KpiCard label="Profit Réel"     value={mad(summary.real_profit)}
                variant={summary.real_profit >= 0 ? "green" : "red"}
                icon={TrendingUp} highlight
                sub="Basé sur commandes payées" />
              <KpiCard label="Pertes Retours"  value={mad(summary.total_return_losses)}
                icon={RotateCcw} variant="red" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="COGS"            value={mad(summary.total_cogs)}   />
              <KpiCard label="Coût Livraison"  value={mad(summary.total_delivery_cost)} icon={Truck} />
            </div>
          </section>

          {/* ── CHARTS ── */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-5">
              <FinanceChart data={daily ?? []} metric="real_revenue" />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <FinanceChart data={daily ?? []} metric="real_profit" />
            </div>
          </section>

          {/* ── PRODUCT TABLE ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Performance par produit
              </h2>
              <a href="/admin/finance" className="text-xs text-primary hover:underline">
                Vue complète →
              </a>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <ProductPerformanceTable data={products ?? []} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
