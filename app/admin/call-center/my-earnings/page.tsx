import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getMyCommissions } from "@/lib/call-center/agent-queries";
import { Award, TrendingUp, DollarSign, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes gains" };
export const dynamic = "force-dynamic";

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
}

export default async function MyEarningsPage() {
  await requireRole(["call_center_agent", "super_admin", "admin", "manager"]);
  const commissions = await getMyCommissions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mes gains</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Commissions sur commandes livrées et payées.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Commission / livraison", value: mad(commissions.commissionPerOrder), icon: Award, cls: "" },
          { label: "Livrés payés", value: String(commissions.totalDeliveredPaid), icon: TrendingUp, cls: "text-emerald-700" },
          { label: "Total gagné", value: mad(commissions.totalEarned), icon: DollarSign, cls: "text-emerald-700 font-bold" },
          { label: "Restant dû", value: mad(commissions.totalRemaining), icon: Clock, cls: commissions.totalRemaining > 0 ? "text-amber-700" : "text-green-700" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <k.icon className={cn("h-4 w-4", k.cls || "text-muted-foreground")} />
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
            <p className={cn("text-xl font-bold font-mono", k.cls)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Payment history */}
      {commissions.payments.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-sm">Historique des paiements</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Période", "Livrés payés", "Brut", "Payé", "Restant", "Statut"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {commissions.payments.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/20">
                    <td className="px-4 py-3 font-mono text-xs">{p.period_start} → {p.period_end}</td>
                    <td className="px-4 py-3 text-center font-bold">{p.delivered_paid_count}</td>
                    <td className="px-4 py-3 font-mono">{mad(p.gross_amount)}</td>
                    <td className="px-4 py-3 font-mono text-green-700 font-semibold">{mad(p.paid_amount)}</td>
                    <td className="px-4 py-3 font-mono text-amber-700">{mad(p.remaining_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        p.status === "paid" ? "bg-green-100 text-green-700" :
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
      )}

      {commissions.payments.length === 0 && (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Award className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm font-medium">Aucun paiement reçu</p>
          <p className="text-xs mt-1">Les paiements apparaîtront ici après traitement par un administrateur.</p>
        </div>
      )}
    </div>
  );
}