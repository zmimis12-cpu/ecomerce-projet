import type { Metadata } from "next";
import { AgentPresence } from "@/components/call-center/agent-presence";
import Link from "next/link";
import { ChevronLeft, ShoppingCart } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCallCenterOrders } from "@/lib/call-center/queries";
import { CCOrdersTable } from "@/components/call-center/cc-orders-table";
import { hasRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Mes Commandes" };
export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const session   = await requireRole(["super_admin","admin","manager","call_center_agent"]);
  const isAgent   = session.role === "call_center_agent";
  const canManage = hasRole(session.role, ["super_admin","admin","manager"]);

  // My-orders = ALL orders assigned to me (including confirmed/refused/delivered)
  const { data: allOrders } = await (await import("@/lib/supabase/server")).createClient()
    .then((s) => s.from("orders").select(`
      id, order_number, customer_name, customer_phone,
      customer_city, customer_address, status, call_status,
      call_attempts, last_call_at, assigned_to, notes, created_at, total_amount_mad, order_items(product_name, product_sku, quantity), delivery_external_status, delivery_external_status_id, delivery_driver_phone, delivery_reported_to
    `)
    .eq("assigned_to", session.authId)
    .order("created_at", { ascending: false })
    .limit(300));

  type O = {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string; status: string;
    call_status: string | null; call_attempts: number; last_call_at: string | null;
    assigned_to: string | null; notes: string | null; created_at: string; total_amount_mad: number;
    agent_name: string | null; first_product_name: string | null; first_product_sku: string | null;
  };
  type OI = O & { order_items?: { product_name: string; product_sku: string; quantity?: number }[] | null };
  const orders = ((allOrders ?? []) as unknown as OI[]).map(({ order_items, ...o }) => ({
    ...o, agent_name: null,
    first_product_name: order_items?.[0]?.product_name ?? null, first_product_sku: order_items?.[0]?.product_sku ?? null,
    first_product_qty: order_items?.[0]?.quantity ?? null,
  }));

  // Chiffres exacts sur les commandes (historique : une commande confirmée puis expédiée reste « confirmée »)
  const { agentRates } = await import("@/lib/call-center/rates");
  const r = (await agentRates([session.authId])).get(session.authId)!;

  return (
    <>
      <AgentPresence />
      <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        {canManage && (
          <Link href="/admin/call-center"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" /> Call Center
          </Link>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Mes Commandes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toutes vos commandes assignées — historique complet.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total commandes", val: r.assigned,                 cls: "",                 sub: `${r.treated} traitées` },
          { label: "Confirmées",      val: r.confirmed,                cls: "text-green-700",   sub: `taux ${r.confirmRate} %` },
          { label: "Sans réponse",    val: r.noAnswer,                 cls: "text-primary",     sub: "à rappeler" },
          { label: "Refusées",        val: r.refused,                  cls: "text-red-600",     sub: "" },
          { label: "Fausses / annulées", val: r.cancelled,             cls: "text-muted-foreground", sub: `dont ${r.fake} fausses` },
          { label: "En route",        val: r.inTransit,                cls: "text-blue-700",    sub: `${r.shipped} expédiées` },
          { label: "Livrées",         val: r.delivered,                cls: "text-emerald-700", sub: r.delivered + r.returned ? `taux ${r.deliveryRate} %` : "aucun colis terminé" },
          { label: "Retours",         val: r.returned,                 cls: "text-red-600",     sub: "" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.val}</p>
            {s.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      <CCOrdersTable
        orders={orders}
        agents={[]}
        canManage={false}
        mode="history"
      />
    </div>
    </>
  );
}
