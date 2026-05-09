import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getOrders } from "@/lib/orders/queries";
import { OrderList } from "@/components/orders/order-list";
import { hasRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Commandes" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await requireRole([
    "super_admin", "admin", "manager", "call_center_agent", "finance", "viewer"
  ]);
  const isAgent   = session.role === "call_center_agent";

  // CC agents → redirect to their dedicated call center queue
  if (isAgent) {
    const { redirect } = await import("next/navigation");
    redirect("/admin/call-center/orders");
  }

  const canManage = hasRole(session.role, ["super_admin", "admin", "manager"]);
  const orders    = await getOrders({}, isAgent, session.authId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Commandes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAgent ? "Vos commandes assignées." : "Toutes les commandes client."}
        </p>
      </div>
      <OrderList orders={orders} canManage={canManage} />
    </div>
  );
}
