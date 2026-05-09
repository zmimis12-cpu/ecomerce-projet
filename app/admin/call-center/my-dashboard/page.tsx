import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getMyStats, getMyCallbacks, getMyCommissions, getMyAssignedOrders } from "@/lib/call-center/agent-queries";
import { Phone, CheckCircle2, XCircle, Clock, Award, TrendingUp, CalendarClock, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mon Dashboard — Call Center" };
export const dynamic = "force-dynamic";

export default async function AgentDashboardPage() {
  const session = await requireRole(["call_center_agent", "super_admin", "admin", "manager"]);

  const [stats, callbacks, commissions, orders] = await Promise.all([
    getMyStats(),
    getMyCallbacks(),
    getMyCommissions(),
    getMyAssignedOrders(),
  ]);

  const pendingOrders   = orders.filter((o) => !["confirmed", "refused", "cancelled"].includes(o.status));
  const callbacksDueNow = callbacks.filter((c) => new Date(c.callback_scheduled_at) <= new Date());

  function fmt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function mad(n: number) { return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD"; }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mon Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Vos performances et commissions personnelles.</p>
      </div>

      {/* Callbacks alert */}
      {callbacksDueNow.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-amber-700 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">
              {callbacksDueNow.length} rappel(s) en attente maintenant
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {callbacksDueNow.slice(0, 3).map((c) => (
                <Link key={c.id} href={`/admin/call-center/orders/${c.id}`}
                  className="text-xs text-amber-700 hover:underline">
                  {c.customer_name} ({c.order_number})
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Appels effectués",   val: stats.callsMade,          icon: Phone,        cls: "" },
          { label: "Confirmés",          val: stats.confirmed,          icon: CheckCircle2, cls: "text-green-700" },
          { label: "Taux confirmation",  val: `${stats.confirmRate}%`,  icon: TrendingUp,   cls: stats.confirmRate >= 60 ? "text-green-700" : "text-amber-600" },
          { label: "Durée moy. appel",   val: fmt(stats.avgDuration),   icon: Clock,        cls: "" },
          { label: "Livrés payés",       val: stats.deliveredPaid,      icon: Award,        cls: "text-emerald-700" },
          { label: "Taux livraison",     val: `${stats.deliveryRate}%`, icon: TrendingUp,   cls: stats.deliveryRate >= 60 ? "text-green-700" : "text-amber-600" },
          { label: "Refus",              val: stats.refused,            icon: XCircle,      cls: "text-red-600" },
          { label: "Fausses commandes",  val: stats.fakeOrders,         icon: AlertTriangle,cls: stats.fakeOrders > 0 ? "text-red-600" : "text-muted-foreground" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <k.icon className={cn("h-4 w-4 shrink-0", k.cls || "text-muted-foreground")} />
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
            <p className={cn("text-2xl font-bold", k.cls)}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Commission summary */}
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/30 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-700" />
          <h2 className="font-semibold text-emerald-800">Mes Commissions</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Commission / livraison", val: mad(commissions.commissionPerOrder), cls: "" },
            { label: "Total livré payé",       val: commissions.totalDeliveredPaid,      cls: "text-emerald-700 text-2xl font-bold" },
            { label: "Total gagné",            val: mad(commissions.totalEarned),        cls: "text-emerald-700 font-bold" },
            { label: "Non payé",               val: mad(commissions.totalRemaining),     cls: commissions.totalRemaining > 0 ? "text-amber-700 font-bold" : "text-green-700" },
          ].map((k) => (
            <div key={k.label} className="rounded-lg bg-white border p-3">
              <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
              <p className={cn("font-semibold", k.cls)}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* Payment history */}
        {commissions.payments.length > 0 && (
          <div className="rounded-lg border bg-white overflow-hidden">
            <p className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
              Historique paiements
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-secondary/20">
                  {["Période", "Livrés payés", "Brut", "Payé", "Restant", "Statut"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {commissions.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/10">
                    <td className="px-4 py-2 font-mono">{p.period_start} → {p.period_end}</td>
                    <td className="px-4 py-2 text-center font-bold">{p.delivered_paid_count}</td>
                    <td className="px-4 py-2 font-mono">{mad(p.gross_amount)}</td>
                    <td className="px-4 py-2 font-mono text-green-700 font-semibold">{mad(p.paid_amount)}</td>
                    <td className="px-4 py-2 font-mono text-amber-700">{mad(p.remaining_amount)}</td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        p.status === "paid" ? "bg-green-100 text-green-700" :
                        p.status === "partially_paid" ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700")}>
                        {p.status === "paid" ? "Payé" : p.status === "partially_paid" ? "Partiel" : "Non payé"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending orders */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="font-semibold text-sm">Mes commandes assignées ({pendingOrders.length})</p>
          <Link href="/admin/call-center/orders" className="text-xs text-primary hover:underline">
            Voir tout →
          </Link>
        </div>
        {pendingOrders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune commande en attente ✓</p>
        ) : (
          <div className="divide-y">
            {pendingOrders.slice(0, 10).map((o) => (
              <Link key={o.id} href={`/admin/call-center/orders/${o.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{o.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{o.order_number} · {o.customer_phone} · {o.customer_city}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.order_items.map((i) => `${i.product_name} ×${i.quantity}`).join(", ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono">{o.total_amount_mad} MAD</p>
                  {o.callback_scheduled_at && (
                    <p className="text-[10px] text-amber-600 font-medium">
                      Rappel: {new Date(o.callback_scheduled_at).toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
