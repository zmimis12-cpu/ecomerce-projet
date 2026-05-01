import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Package } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCallCenterOrderDetail } from "@/lib/call-center/queries";
import { CallTimer } from "@/components/call-center/call-timer";
import { CallResultBadge } from "@/components/call-center/call-result-badge";
import { StatusBadge } from "@/components/orders/status-badge";
import { hasRole } from "@/lib/auth/roles";
import type { OrderStatus } from "@/types/orders";
import type { CallResult } from "@/types/call-center";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCallCenterOrderDetail(id);
  return { title: detail ? `${detail.order.order_number} — Call Center` : "Commande" };
}

export default async function CCOrderCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole(["super_admin","admin","manager","call_center_agent"]);
  const isAgent = session.role === "call_center_agent";
  const canManage = hasRole(session.role, ["super_admin","admin","manager"]);

  const detail = await getCallCenterOrderDetail(id);
  if (!detail) notFound();

  const { order, items, logs } = detail;

  // Agent can only access their assigned orders
  if (isAgent && order.assigned_to !== session.authId) notFound();

  // For the CallTimer client component to work after call, we pass a key
  // based on call_attempts so it resets when a call is logged
  const timerKey = `call-${id}-${order.call_attempts}`;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/admin/call-center/orders"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Commandes
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-mono font-medium">{order.order_number}</span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={order.status as OrderStatus} />
        {order.call_status && <CallResultBadge result={order.call_status} />}
        {order.call_attempts > 0 && (
          <span className="text-xs text-muted-foreground">
            {order.call_attempts} tentative{order.call_attempts > 1 ? "s" : ""}
          </span>
        )}
        {order.last_call_at && (
          <span className="text-xs text-muted-foreground">
            Dernier appel: {new Date(order.last_call_at).toLocaleString("fr-MA")}
          </span>
        )}
      </div>

      {/* Customer info */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Client</h3>
        <div className="space-y-2">
          <p className="text-xl font-semibold">{order.customer_name}</p>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {order.customer_city}{order.customer_address ? ` — ${order.customer_address}` : ""}
          </div>
        </div>
      </div>

      {/* Products — no price for agents */}
      {items.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Produits</h3>
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {item.product_sku} × {item.quantity}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
          <p className="text-xs font-medium text-amber-700 mb-1">Notes</p>
          <p className="text-sm text-amber-900">{order.notes}</p>
        </div>
      )}

      {/* Call timer — main interaction */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Appel</h3>
        <CallTimer
          key={timerKey}
          orderId={id}
          customerPhone={order.customer_phone}
          onComplete={() => {}}
        />
      </div>

      {/* Previous calls */}
      {logs.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Historique des appels</h3>
          <div className="divide-y">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 py-2.5">
                <CallResultBadge result={log.disposition as CallResult} />
                <div className="flex-1 min-w-0">
                  {log.notes && <p className="text-xs text-muted-foreground truncate">{log.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  {log.duration_seconds !== null && (
                    <p className="text-xs font-mono">{log.duration_seconds}s</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleDateString("fr-MA")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin link back to full order */}
      {canManage && (
        <Link href={`/admin/orders/${id}`}
          className="flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          Voir la commande complète →
        </Link>
      )}
    </div>
  );
}
