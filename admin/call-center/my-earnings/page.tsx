import type { Metadata } from "next";
import { AgentPresence } from "@/components/call-center/agent-presence";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Award, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes Gains — Call Center" };
export const dynamic = "force-dynamic";

const COMMISSION_PER_ORDER = 3;

export default async function MyEarningsPage() {
  const session = await requireRole(["call_center_agent", "super_admin", "admin", "manager"]);
  const agentId = session.authId;

  // Delivered paid orders assigned to this agent
  const { data: deliveredOrders } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, total_amount_mad, updated_at")
    .eq("assigned_to", agentId)
    .eq("status", "paid")
    .order("updated_at", { ascending: false });

  const orders = (deliveredOrders ?? []) as { id: string; order_number: string; total_amount_mad: number; updated_at: string }[];
  const totalEarned = orders.length * COMMISSION_PER_ORDER;

  // Payment records
  const { data: payments } = await supabaseAdmin
    .from("call_center_agent_payments")
    .select("id, period_start, period_end, delivered_paid_count, gross_amount, paid_amount, remaining_amount, status, paid_at")
    .eq("agent_id", agentId)
    .order("period_start", { ascending: false });

  type Payment = { id: string; period_start: string; period_end: string; delivered_paid_count: number; gross_amount: number; paid_amount: number; remaining_amount: number; status: string; paid_at: string | null };
  const paymentRows = (payments ?? []) as Payment[];
  const totalPaid = paymentRows.reduce((s, p) => s + (p.paid_amount ?? 0), 0);
  const totalRemaining = Math.max(0, totalEarned - totalPaid);

  function mad(n: number) {
    return n.toLocaleString("fr-MA", { minimumFractionDigits: 2 }) + " MAD";
  }

  return (
    <>
      <AgentPresence />
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
          { label: "Commission / livraison", val: mad(COMMISSION_PER_ORDER), icon: Award,         cls: "" },
          { label: "Livrés payés",           val: String(orders.length),     icon: CheckCircle,   cls: "text-emerald-700" },
          { label: "Total gagné",            val: mad(totalEarned),          icon: Award,         cls: "text-emerald-700" },
          { label: "Non payé",               val: mad(totalRemaining),       icon: totalRemaining > 0 ? AlertTriangle : CheckCircle, cls: totalRemaining > 0 ? "text-amber-700" : "text-green-700" },
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
      {totalRemaining > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{mad(totalRemaining)}</span> en attente de paiement.
          </p>
        </div>
      )}

      {/* Recent delivered orders */}
      {orders.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Commandes livrées payées ({orders.length})</p>
          </div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {orders.slice(0, 20).map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-mono font-medium">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{new Date(o.updated_at).toLocaleDateString("fr-MA")}</p>
                </div>
                <p className="text-xs text-emerald-600 font-bold">+{mad(COMMISSION_PER_ORDER)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      {paymentRows.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="font-semibold text-sm">Historique paiements</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Période", "Livrés", "Brut", "Payé", "Restant", "Statut"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {paymentRows.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/10">
                    <td className="px-4 py-2.5 font-mono text-xs">{p.period_start} → {p.period_end}</td>
                    <td className="px-4 py-2.5 text-center font-bold">{p.delivered_paid_count}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{mad(p.gross_amount)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-green-700 font-semibold">{mad(p.paid_amount)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-amber-700">{mad(p.remaining_amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
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
        </div>
      ) : (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-12 text-center gap-2">
          <Award className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Aucun paiement enregistré pour le moment.</p>
        </div>
      )}
    </div>
    </>
  );
}
