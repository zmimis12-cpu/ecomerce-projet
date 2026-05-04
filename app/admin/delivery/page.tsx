import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getDeliveryOrders, getDeliverySummary } from "@/lib/delivery/queries";
import { DeliveryList } from "@/components/delivery/delivery-list";
import { formatMAD } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { Truck, Package, CheckCircle, XCircle, TrendingUp,
         DollarSign, BarChart3, AlertTriangle } from "lucide-react";

export const metadata: Metadata = { title: "Livraison" };
export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  await requireRole(["super_admin","admin","manager"]);

  const [orders, summary] = await Promise.all([
    getDeliveryOrders(),
    getDeliverySummary(),
  ]);

  const alerts: string[] = [];
  if (summary.deliveryRate < 30) alerts.push(`Taux de livraison très bas: ${summary.deliveryRate}%`);
  if (summary.totalProfit < 0)   alerts.push(`Profit réel négatif: ${formatMAD(summary.totalProfit)}`);
  if (summary.returned > 5)      alerts.push(`${summary.returned} retours — vérifiez les produits concernés`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Livraison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Expéditions Digylog — suivi en temps réel via webhook.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Total"        value={summary.total}
          icon={<Package className="h-4 w-4" />} />
        <KpiCard label="En transit"   value={summary.in_transit}
          icon={<Truck className="h-4 w-4" />}  info />
        <KpiCard label="Livrés"       value={summary.delivered}
          icon={<CheckCircle className="h-4 w-4" />} positive />
        <KpiCard label="Payés"        value={summary.paid}
          icon={<DollarSign className="h-4 w-4" />} positive />
        <KpiCard label="Retours"      value={summary.returned}
          icon={<XCircle className="h-4 w-4" />}
          negative={summary.returned > 0} />
        <KpiCard label="Taux livr."   value={`${summary.deliveryRate}%`}
          icon={<BarChart3 className="h-4 w-4" />}
          positive={summary.deliveryRate >= 70}
          negative={summary.deliveryRate < 50} />
        <KpiCard label="Profit réel"  value={formatMAD(summary.totalProfit)}
          icon={<TrendingUp className="h-4 w-4" />}
          positive={summary.totalProfit > 0}
          negative={summary.totalProfit < 0} />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              {a}
            </div>
          ))}
        </div>
      )}

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
      <div className={cn("text-muted-foreground",
        positive && "text-green-600", negative && "text-red-500", info && "text-blue-600"
      )}>{icon}</div>
      <p className={cn("text-lg font-bold font-mono",
        positive && "text-green-700", negative && "text-red-600", info && "text-blue-700"
      )}>{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
