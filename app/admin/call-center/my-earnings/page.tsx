import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getMyCommissions } from "@/lib/call-center/agent-queries";
import { Award, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes Gains — Call Center" };
export const dynamic = "force-dynamic";

export default async function MyEarningsPage() {
  await requireRole(["call_center_agent", "super_admin", "admin", "manager"]);
  const commissions = await getMyCommissions();

  function mad(n: number) {
    return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Award className="h-5 w-5 text-emerald-600" />
          Mes Gains
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Commissions basées sur les commandes livrées et payées uniquement.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Commission / livraison",
            val:   mad(commissions.commissionPerOrder),
            cls:   "",
            icon:  Award,
          },
          {
            label: "Livrés payés",
            val:   String(commissions.totalDeliveredPaid),
            cls:   "text-emerald-700",
            icon:  CheckCircle,
          },
          {
            label: "Total gagné",
            val:   mad(commissions.totalEarned),
            cls:   "text-emerald-700",
            icon:  Award,
          },
          {
            label: "Non payé",
            val:   mad(commissions.totalRemaining),
            cls:   commissions.totalRemaining > 0 ? "text-amber-700" : "text-green-700",
            icon:  commissions.totalRemaining > 0 ? AlertTriangle : CheckCircle,
          },
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

      {/* Unpaid alert */}
      {commissions.totalRemaining > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{mad(commissions.totalRemaining)}</span> en attente de paiement.
            Contactez votre responsable pour le règlement.
          </p>
        </div>
      )}

      {/* Recent delivered orders */}
      {commissions.recentOrders.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Commandes livrées payées récentes</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {commissions.totalDeliveredPaid} au total · {mad(commissions.commissionPerOrder)} par commande
            </p>
          </div>
          <div className="divide-y">
            {commissions.recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-mono font-medium">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.updated_at).toLocaleDateString("fr-MA")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">{mad(o.total_amount_mad)}</p>
                  <p className="text-xs text-emerald-600 font-semibold">+{mad(commissions.commissionPerOrder)} commission</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      {commissions.payments.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Historique paiements</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Période", "Livrés payés", "Brut", "Payé", "Restant", "Statut"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {commissions.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/10">
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {p.period_start} → {p.period_end}
                    </td>
                    <td className="px-4 py-2.5 text-center font-bold">{p.delivered_paid_count}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{mad(p.gross_amount)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-green-700 font-semibold">
                      {mad(p.paid_amount)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-700">
                      {mad(p.remaining_amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        p.status === "paid"           ? "bg-green-100 text-green-700" :
                        p.status === "partially_paid" ? "bg-amber-100 text-amber-700" :
                                                        "bg-red-100 text-red-700"
                      )}>
                        {p.status === "paid" ? "Payé" : p.status === "partially_paid" ? "Partiel" : "Non payé"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-12 text-center gap-2">
          <Award className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Aucun paiement enregistré</p>
          <p className="text-xs text-muted-foreground">Les paiements apparaîtront ici après validation par votre responsable.</p>
        </div>
      )}
    </div>
  );
}
