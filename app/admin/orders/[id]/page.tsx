import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Calendar, Hash, Globe } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getOrder, getAgents } from "@/lib/orders/queries";
import { StatusBadge } from "@/components/orders/status-badge";
import { StatusUpdater } from "@/components/orders/status-updater";
import { AgentAssigner } from "@/components/orders/agent-assigner";
import { TrackingEditor } from "@/components/orders/tracking-editor";
import { DeleteOrderButton } from "@/components/orders/delete-order-button";
import { hasRole } from "@/lib/auth/roles";
import { DuplicateBadge } from "@/components/orders/duplicate-badge";
import { formatOrderDate, STATUS_LABELS } from "@/types/orders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrder(id);
  return { title: order ? `${order.order_number} — Commandes` : "Commande introuvable" };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole([
    "super_admin", "admin", "manager", "call_center_agent", "finance", "viewer"
  ]);
  const order = await getOrder(id);
  if (!order) notFound();

  const canManage  = hasRole(session.role, ["super_admin", "admin", "manager"]);
  const isAgent    = session.role === "call_center_agent";
  const canEdit    = canManage || (isAgent && order.assigned_to === session.authId);

  // Agent can't see order not assigned to them
  if (isAgent && order.assigned_to !== session.authId) notFound();

  const agents = canManage ? await getAgents() : [];
  const profit = order.estimated_profit ?? 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/orders"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" /> Commandes
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-mono font-medium">{order.order_number}</span>
        </div>
        {canManage && <DeleteOrderButton orderId={id} orderNumber={order.order_number} />}
      </div>

      {/* Duplicate warning */}
      {order.is_duplicate && (
        <DuplicateBadge
          variant="full"
          duplicateOfId={order.duplicate_of}
          duplicateOfNumber={null}
        />
      )}

      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total commande" value={`${(order.total_amount_mad ?? 0).toFixed(2)} MAD`} />
        <StatCard label="Sous-total"     value={`${(order.subtotal ?? 0).toFixed(2)} MAD`} />
        <StatCard label="Profit estimé"  value={`${profit.toFixed(2)} MAD`}
          className={profit >= 0 ? "text-green-600" : "text-red-600"} />
        <StatCard label="Paiement"       value={order.payment_method?.toUpperCase() ?? "COD"} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — order info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Order items */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Articles</h3>
            <div className="divide-y">
              {(order.items ?? []).map((item) => (
                <div key={item.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.product_sku}</p>
                    <p className="text-xs text-muted-foreground">
                      Qté: {item.quantity} × {item.unit_price.toFixed(2)} MAD
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-medium">{item.line_total.toFixed(2)} MAD</p>
                    <p className={cn(
                      "text-xs font-mono",
                      item.line_gross_profit >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      Profit: {item.line_gross_profit.toFixed(2)} MAD
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="pt-2 border-t space-y-1">
              <Row label="Sous-total"         value={`${(order.subtotal ?? 0).toFixed(2)} MAD`} />
              <Row label="Frais de livraison" value={`${(order.shipping_charge ?? 0).toFixed(2)} MAD`} />
              <Row label="Total"              value={`${(order.total_amount_mad ?? 0).toFixed(2)} MAD`} bold />
            </div>
          </div>

          {/* Customer info */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Client</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="Nom"      value={order.customer_name} />
              <InfoRow label="Téléphone" value={order.customer_phone} />
              <InfoRow label="Ville"    value={order.customer_city} />
              <InfoRow label="Adresse"  value={order.customer_address} />
              {order.customer_region && <InfoRow label="Région" value={order.customer_region} />}
            </div>
          </div>

          {/* Status history */}
          {(order.status_history ?? []).length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Historique des statuts</h3>
              <div className="space-y-2">
                {order.status_history?.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 text-xs">
                    <div className="h-1.5 w-1.5 rounded-full bg-border mt-1.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {h.from_status && (
                          <><StatusBadge status={h.from_status} /><span className="text-muted-foreground">→</span></>
                        )}
                        <StatusBadge status={h.to_status} />
                      </div>
                      {h.notes && <p className="text-muted-foreground mt-0.5">{h.notes}</p>}
                      <p className="text-muted-foreground">{formatOrderDate(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — actions sidebar */}
        <div className="space-y-5">
          {/* Status */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Statut</h3>
            {canEdit ? (
              <StatusUpdater orderId={id} currentStatus={order.status} isAgent={isAgent} />
            ) : (
              <StatusBadge status={order.status} />
            )}
          </div>

          {/* Agent assignment */}
          {canManage && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Agent assigné</h3>
              <AgentAssigner orderId={id} currentAgentId={order.assigned_to} agents={agents} />
            </div>
          )}

          {/* Tracking + notes */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Livraison & Notes</h3>
            <TrackingEditor
              orderId={id}
              tracking={order.delivery_tracking_number}
              notes={order.notes}
              canEdit={canEdit}
            />
          </div>

          {/* Meta */}
          <div className="rounded-xl border bg-card p-5 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><Hash className="h-3 w-3" /> {order.order_number}</div>
            <div className="flex items-center gap-2"><Calendar className="h-3 w-3" /> {formatOrderDate(order.created_at)}</div>
            {order.source && <div className="flex items-center gap-2"><Globe className="h-3 w-3" /> {order.source}</div>}
            {order.delivery_tracking_number && (
              <div className="font-mono text-foreground">{order.delivery_tracking_number}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-bold font-mono", className ?? "text-foreground")}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", bold && "font-bold")}>{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}
