import type { Metadata } from "next";
import {
  TrendingUp, ShoppingCart, CheckCircle, Truck, RotateCcw,
  DollarSign, AlertTriangle, Package, ArrowUpRight,
} from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getDashboardSummary, getProductPerformance, getDailyFinance } from "@/lib/dashboard/queries";
import { hasRole } from "@/lib/auth/roles";
import { KpiCard, RateBadge } from "@/components/dashboard/kpi-card";
import { ProductPerformanceTable } from "@/components/dashboard/product-performance-table";
import { FinanceChart } from "@/components/dashboard/finance-chart";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MAD";
}

export default async function AdminDashboardPage() {
  const session = await requireRole(["super_admin","admin","manager","finance","call_center_agent","scanner_agent"]);
  const canSeeFinance = hasRole(session.role, ["super_admin","admin","manager","finance"]);

  const [summary, products, daily] = await Promise.all([
    canSeeFinance ? getDashboardSummary() : null,
    canSeeFinance ? getProductPerformance() : null,
    canSeeFinance ? getDailyFinance(14) : null,
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bonjour, <span className="font-medium">{session.displayName}</span> —{" "}
          {new Date().toLocaleDateString("fr-MA", { weekday:"long", day:"numeric", month:"long" })}
        </p>
      </div>

      {/* Call center agent — limited view */}
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
          {/* ── FUNNEL KPIS ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Funnel commandes
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard label="Total Leads" value={summary.total_leads.toLocaleString()}
                icon={ShoppingCart} sub={`${summary.refused_count} refusés · ${summary.no_answer_count} sans réponse`} />
              <KpiCard label="Confirmés" value={summary.confirmed_count.toLocaleString()}
                icon={CheckCircle} variant="blue"
                sub={`${summary.confirmation_rate}% taux confirmation`} />
              <KpiCard label="Livrés" value={summary.delivered_count.toLocaleString()}
                icon={Truck} variant="green"
                sub={`${summary.delivery_rate}% taux livraison`} />
              <KpiCard label="Retournés" value={summary.returned_count.toLocaleString()}
                icon={RotateCcw} variant="red"
                sub={`${summary.total_leads > 0 ? (summary.returned_count / summary.total_leads * 100).toFixed(1) : 0}% taux retour`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <RateBadge rate={summary.confirmation_rate} label="Taux de Confirmation" threshold={50} />
              <RateBadge rate={summary.delivery_rate} label="Taux de Livraison" threshold={70} />
            </div>
          </section>

          {/* ── FINANCE KPIS ── */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Finance
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="CA Estimé" value={mad(summary.estimated_revenue)}
                icon={DollarSign} sub="Toutes commandes non annulées" />
              <KpiCard label="CA Réel Collecté" value={mad(summary.real_revenue)}
                icon={TrendingUp} variant="green"
                sub="Commandes marquées payées" highlight />
              <KpiCard label="À Collecter" value={mad(summary.pending_collection)}
                icon={ArrowUpRight} variant="amber"
                sub="Livrées non encore payées" />
              <KpiCard label="Profit Estimé" value={mad(summary.estimated_profit)}
                icon={TrendingUp} />
              <KpiCard label="Profit Réel" value={mad(summary.real_profit)}
                icon={TrendingUp}
                variant={summary.real_profit >= 0 ? "green" : "red"}
                highlight sub="Basé sur commandes payées" />
              <KpiCard label="Pertes Retours" value={mad(summary.total_return_losses)}
                icon={AlertTriangle} variant="red"
                sub="Coûts liés aux retours" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="COGS Total" value={mad(summary.total_cogs)}
                icon={Package} sub="Coût des produits vendus" />
              <KpiCard label="Coût Livraison" value={mad(summary.total_delivery_cost)}
                icon={Truck} sub="Frais transporteur réels" />
            </div>
          </section>

          {/* ── CHART ── */}
          <section className="space-y-3">
            <div className="rounded-xl border bg-card p-5">
              <FinanceChart data={daily ?? []} metric="real_revenue" />
            </div>
          </section>

          {/* ── PRODUCT PERFORMANCE ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Performance Produits
              </h2>
              <a href="/admin/finance" className="text-xs text-primary hover:underline">
                Vue complète →
              </a>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              <ProductPerformanceTable data={products ?? []} />
            </div>
          </section>

          {/* ── ALERTS ── */}
          {(summary.pending_collection > 0 || summary.total_return_losses > 0) && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Alertes Finance
              </h2>
              <div className="space-y-2">
                {summary.pending_collection > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        {mad(summary.pending_collection)} à collecter auprès du transporteur
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Des commandes livrées ne sont pas encore marquées comme payées.
                        <a href="/admin/finance" className="ml-1 underline">Voir les détails →</a>
                      </p>
                    </div>
                  </div>
                )}
                {summary.total_return_losses > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
                    <RotateCcw className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">
                        {mad(summary.total_return_losses)} de pertes sur retours
                      </p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Analysez les produits avec taux de retour élevé.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
