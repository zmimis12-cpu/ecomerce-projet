import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin, Package } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getReturn } from "@/lib/returns/queries";
import { ReturnConditionBadge } from "@/components/returns/return-condition-badge";
import { formatMAD } from "@/types/delivery";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ret = await getReturn(id);
  return { title: ret ? `${ret.return_number} — Retours` : "Retour" };
}

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(["super_admin", "admin", "manager", "scanner_agent"]);
  const ret = await getReturn(id);
  if (!ret) notFound();

  const totalWriteOff = ret.items?.reduce((s, i) => s + (i.write_off_value ?? 0), 0) ?? 0;
  const totalRestocked = ret.items?.reduce((s, i) => s + i.restocked_qty, 0) ?? 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/admin/returns"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /> Retours
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-mono font-medium">{ret.return_number}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <ReturnConditionBadge condition={ret.condition} />
        <span className="text-xs text-muted-foreground">{ret.status}</span>
        {ret.received_at && (
          <span className="text-xs text-muted-foreground">
            Reçu le {new Date(ret.received_at).toLocaleDateString("fr-MA")}
          </span>
        )}
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Montant commande" value={formatMAD(ret.total_amount_mad ?? 0)} />
        <StatCard label="Perte write-off"  value={formatMAD(totalWriteOff)} negative={totalWriteOff > 0} />
        <StatCard label="À réclamer"       value={formatMAD(ret.claim_amount_mad ?? 0)} warn={!!ret.claim_amount_mad} />
        <StatCard label="Réintégré stock"  value={String(totalRestocked)} positive={totalRestocked > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Order info */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Commande d&apos;origine</h3>
          <div className="space-y-2">
            <Link href={`/admin/orders/${ret.order_id}`}
              className="font-mono text-sm font-medium hover:underline text-primary">
              {ret.order_number ?? ret.order_id.slice(0, 8)}
            </Link>
            <p className="font-medium">{ret.customer_name}</p>
            {ret.customer_phone && (
              <p className="text-sm text-muted-foreground font-mono">{ret.customer_phone}</p>
            )}
            {ret.customer_city && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />{ret.customer_city}
              </div>
            )}
          </div>
          {ret.reason && (
            <div className="rounded-lg bg-secondary/30 px-3 py-2.5 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Raison</p>
              {ret.reason}
            </div>
          )}
        </div>

        {/* Items */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold">Articles retournés</h3>
          {(ret.items ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun article.</p>
          ) : (
            <div className="divide-y">
              {ret.items?.map((item) => (
                <div key={item.id} className="py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.product_sku}</p>
                    </div>
                    <ReturnConditionBadge condition={item.condition} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <QtyCell label="Retourné" value={item.returned_qty} />
                    <QtyCell label="Bon état" value={item.good_qty} positive />
                    <QtyCell label="Endommagé" value={item.damaged_qty} negative={item.damaged_qty > 0} />
                    <QtyCell label="Manquant" value={item.missing_qty} negative={item.missing_qty > 0} />
                    <QtyCell label="Réintégré" value={item.restocked_qty} positive={item.restocked_qty > 0} />
                    <QtyCell label="Write-off" value={`${formatMAD(item.write_off_value)}`} negative={!!item.write_off_value && item.write_off_value > 0} />
                  </div>
                  {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, positive, negative, warn }: {
  label: string; value: string; positive?: boolean; negative?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-1",
      positive && "border-green-200 bg-green-50/30",
      negative && "border-red-200 bg-red-50/30",
      warn     && "border-amber-200 bg-amber-50/30"
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "text-base font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600",
        warn     && "text-amber-700"
      )}>{value}</p>
    </div>
  );
}

function QtyCell({ label, value, positive, negative }: {
  label: string; value: string | number; positive?: boolean; negative?: boolean;
}) {
  return (
    <div className="rounded bg-secondary/30 px-2 py-1.5 text-center">
      <p className="text-muted-foreground">{label}</p>
      <p className={cn("font-mono font-bold", positive && "text-green-600", negative && "text-red-600")}>{value}</p>
    </div>
  );
}
