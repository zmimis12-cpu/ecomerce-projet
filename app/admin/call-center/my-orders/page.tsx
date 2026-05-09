import type { Metadata } from "next";
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
      call_attempts, last_call_at, assigned_to, notes, created_at, total_amount_mad
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
  const orders = ((allOrders ?? []) as unknown as O[]).map((o) => ({ ...o, agent_name: null, first_product_name: null, first_product_sku: null }));

  // Group by status
  const confirmed  = orders.filter((o) => o.status === "confirmed").length;
  const refused    = orders.filter((o) => o.status === "refused").length;
  const delivered  = orders.filter((o) => ["delivered", "paid"].includes(o.status)).length;
  const pending    = orders.filter((o) => ["new", "no_answer", "pending"].includes(o.status)).length;

  return (
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
          { label: "En attente",  val: pending,   cls: "text-primary"     },
          { label: "Confirmés",   val: confirmed, cls: "text-green-700"   },
          { label: "Refusés",     val: refused,   cls: "text-red-600"     },
          { label: "Livrés",      val: delivered, cls: "text-emerald-700" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={cn("text-2xl font-bold", s.cls)}>{s.val}</p>
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
  );
}
