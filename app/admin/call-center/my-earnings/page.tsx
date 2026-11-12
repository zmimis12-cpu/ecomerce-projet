import type { Metadata } from "next";
import { AgentPresence } from "@/components/call-center/agent-presence";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Award, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAgentPayments } from "@/lib/call-center/agent-queries";
import { AgentPaymentsList } from "@/components/call-center/agent-payments-list";

export const metadata: Metadata = { title: "Mes Gains — Call Center" };
export const dynamic = "force-dynamic";


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
  // Rémunération réglée par l'admin sur la fiche agent (commission / salaire / les deux)
  const { agentEarnings, PAY_BASIS_LABEL, usesCommission, usesSalary } = await import("@/lib/call-center/pay");
  const earn = await agentEarnings(agentId);
  const p = earn.pay;
  const totalEarned = earn.total;
  const payLabel = p.mode === "product" ? "Par commande payée"
    : [usesSalary(p) ? `${p.salary} MAD / mois` : "", usesCommission(p) ? `${p.amount} MAD ${PAY_BASIS_LABEL[p.basis]}` : ""].filter(Boolean).join(" + ");

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
  const detailed = await getAgentPayments({ agentId });

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
          Selon la rémunération fixée par l&apos;administration.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Ma rémunération",       val: payLabel,                  icon: Award,         cls: "text-base" },
          { label: "Commandes comptées",    val: String(earn.count),        icon: CheckCircle,   cls: "text-emerald-700" },
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
                {usesCommission(p) && <p className="text-xs text-emerald-600 font-bold">+{mad(p.amount)}</p>}
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
          <AgentPaymentsList rows={detailed} />
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
