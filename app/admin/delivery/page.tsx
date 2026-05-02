import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryOrders, getDeliverySummary } from "@/lib/delivery/queries";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { formatMAD } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { Truck, Package, CheckCircle, XCircle, TrendingUp, DollarSign, BarChart3 } from "lucide-react";

export const metadata: Metadata = { title: "Livraison" };
export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  await requireRole(["super_admin", "admin", "manager"]);

  const [orders, summary] = await Promise.all([
    getDeliveryOrders(),
    getDeliverySummary(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivi des expéditions et calcul du profit réel.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Total expéditions" value={summary.total}           icon={<Package className="h-4 w-4" />} />
        <KpiCard label="En transit"         value={summary.in_transit}      icon={<Truck className="h-4 w-4" />}   info />
        <KpiCard label="Livrées"            value={summary.delivered}       icon={<CheckCircle className="h-4 w-4" />} positive />
        <KpiCard label="Payées"             value={summary.paid}            icon={<DollarSign className="h-4 w-4" />} positive />
        <KpiCard label="Retours"            value={summary.returned}        icon={<XCircle className="h-4 w-4" />}   negative={summary.returned > 0} />
        <KpiCard label="Taux livraison"     value={`${summary.deliveryRate}%`} icon={<BarChart3 className="h-4 w-4" />}
          positive={summary.deliveryRate >= 70} negative={summary.deliveryRate < 50} />
        <KpiCard label="Profit réel total"  value={formatMAD(summary.totalProfit)}
          icon={<TrendingUp className="h-4 w-4" />}
          positive={summary.totalProfit > 0} negative={summary.totalProfit < 0} />
      </div>

      <DeliveryList orders={orders} />
    </div>
  );
}

function KpiCard({ label, value, icon, positive, negative, info }: {
  label: string; value: string | number; icon: React.ReactNode;
  positive?: boolean; negative?: boolean; info?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-2",
      positive && "border-green-200 bg-green-50/40",
      negative && "border-red-200 bg-red-50/40",
      info     && "border-blue-200 bg-blue-50/40"
    )}>
      <div className={cn(
        "text-muted-foreground",
        positive && "text-green-600",
        negative && "text-red-500",
        info     && "text-blue-600"
      )}>{icon}</div>
      <p className={cn(
        "text-lg font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600",
        info     && "text-blue-700"
      )}>{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
