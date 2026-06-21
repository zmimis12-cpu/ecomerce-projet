import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryOrderDetail } from "@/lib/delivery/queries";
import { DeliveryStatusBadge } from "@/components/delivery/delivery-status-badge";
import { DeliveryActionsPanel } from "@/components/delivery/delivery-actions-panel";
import { DeliveryTimeline } from "@/components/delivery/delivery-timeline";
import { StatusBadge } from "@/components/orders/status-badge";
import { formatMAD } from "@/types/delivery";
import type { OrderStatus } from "@/types/orders";
import type { DeliveryStatus } from "@/types/delivery";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getDeliveryOrderDetail(id);
  return { title: detail ? `${detail.order.order_number} — Livraison` : "Livraison" };
}

export default async function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager"]);

  const detail = await getDeliveryOrderDetail(id);
  if (!detail) notFound();

  const { order, items, history } = detail;

  const estProfit  = order.estimated_profit ?? null;
  const realProfit = order.real_profit_mad  ?? null;
  const profitDiff = estProfit !== null && realProfit !== null ? realProfit - estProfit : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/delivery"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" /> Livraison
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-mono font-medium">{order.order_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={order.status as OrderStatus} />
          {order.delivery_status && <DeliveryStatusBadge status={order.delivery_status} />}
          {order.is_paid && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
              ✓ Payé
            </span>
          )}
        </div>
      </div>

      {/* Profit cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ProfitCard label="Montant commande" value={formatMAD(order.total_amount_mad)} />
        <ProfitCard
          label="Profit estimé"
          value={formatMAD(estProfit)}
          color={estProfit !== null ? (estProfit >= 0 ? "text-green-600" : "text-red-600") : ""}
        />
        <ProfitCard
          label="Profit réel"
          value={realProfit !== null ? formatMAD(realProfit) : "En attente paiement"}
          color={realProfit !== null ? (realProfit >= 0 ? "text-green-600" : "text-red-600") : "text-muted-foreground"}
          sub={profitDiff !== null ? `Écart : ${profitDiff >= 0 ? "+" : ""}${formatMAD(profitDiff)}` : undefined}
        />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left — order info + timeline */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Client</h3>
            <p className="font-semibold">{order.customer_name}</p>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {order.customer_city}{order.customer_address ? ` — ${order.customer_address}` : ""}
            </div>
            <p className="text-sm font-mono">{(order as unknown as { customer_phone: string }).customer_phone ?? ""}</p>
          </div>

          {/* Items */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Articles</h3>
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{item.product_sku} × {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{formatMAD(item.line_total)}</p>
                    <p className={cn("text-xs font-mono", item.line_gross_profit >= 0 ? "text-green-600" : "text-red-600")}>
                      {formatMAD(item.line_gross_profit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Cost breakdown */}
            <div className="pt-2 border-t space-y-1 text-xs">
              <CostRow label="Sous-total"          value={formatMAD(order.subtotal)} />
              <CostRow label="Frais livraison (client)" value={formatMAD(order.shipping_charge)} />
              <CostRow label="Coût livraison réel" value={formatMAD(order.delivery_cost_real_mad)} />
              {order.estimated_ads_cost !== null && (
                <CostRow label="Coût pub (estimé)" value={formatMAD(order.estimated_ads_cost)} />
              )}
              {order.estimated_confirmation_cost !== null && (
                <CostRow label="Coût confirmation" value={formatMAD(order.estimated_confirmation_cost)} />
              )}
              {order.return_cost_mad > 0 && (
                <CostRow label="Coût retour" value={formatMAD(order.return_cost_mad)} negative />
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Timeline livraison</h3>
            <DeliveryTimeline order={{
              status:               order.status,
              confirmed_at:         order.confirmed_at,
              sent_to_delivery_at:  order.sent_to_delivery_at,
              delivered_at:         order.delivered_at,
              paid_at:              order.paid_at,
              returned_at:          order.returned_at,
              created_at:           order.created_at,
            }} />
          </div>

          {/* Status history */}
          {history.length > 0 && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Historique</h3>
              <div className="divide-y">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 py-2 text-xs">
                    <span className="text-muted-foreground shrink-0">
                      {new Date(h.created_at).toLocaleString("fr-MA")}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{h.to_status}</span>
                    {h.notes && <span className="text-muted-foreground truncate">{h.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="space-y-4">
          <DeliveryActionsPanel
            orderId={id}
            currentStatus={order.status}
            deliveryStatus={order.delivery_status as DeliveryStatus | null}
            trackingNumber={order.delivery_tracking_number}
            deliveryCompany={order.delivery_company}
            deliveryCostReal={order.delivery_cost_real_mad ?? 0}
            returnCost={order.return_cost_mad ?? 0}
            isPaid={order.is_paid}
          />

          {/* Links */}
          <div className="space-y-2">
            <Link href={`/admin/orders/${id}`}
              className="flex items-center justify-center rounded-lg border py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Voir commande complète →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfitCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold font-mono", color ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground font-mono">{sub}</p>}
    </div>
  );
}

function CostRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", negative && "text-red-600")}>{value}</span>
    </div>
  );
}
