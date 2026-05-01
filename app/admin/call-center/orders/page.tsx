import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCallCenterOrders } from "@/lib/call-center/queries";
import { getAgents } from "@/lib/orders/queries";
import { CCOrdersTable } from "@/components/call-center/cc-orders-table";
import { hasRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Commandes CC" };
export const dynamic = "force-dynamic";

export default async function CCOrdersPage() {
  const session   = await requireRole(["super_admin","admin","manager","call_center_agent"]);
  const isAgent   = session.role === "call_center_agent";
  const canManage = hasRole(session.role, ["super_admin","admin","manager"]);

  const [orders, agents] = await Promise.all([
    getCallCenterOrders({ isAgent, authId: session.authId }),
    canManage ? getAgents() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {canManage && (
          <>
            <Link href="/admin/call-center"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" /> Call Center
            </Link>
            <span className="text-muted-foreground">/</span>
          </>
        )}
        <span className="text-sm font-medium">Commandes</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {isAgent ? "Mes commandes à appeler" : "Commandes Call Center"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAgent ? "Cliquez sur une commande pour démarrer l'appel." : `${orders.length} commande(s) en cours.`}
        </p>
      </div>

      <CCOrdersTable
        orders={orders}
        agents={agents.map((a) => ({ id: a.id, full_name: a.full_name }))}
        canManage={canManage}
      />
    </div>
  );
}
