import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { getReturns, getReturnsSummary } from "@/lib/returns/queries";
import { ReturnConditionBadge } from "@/components/returns/return-condition-badge";
import { formatMAD } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { RotateCcw, TrendingDown, AlertTriangle, Package } from "lucide-react";

export const metadata: Metadata = { title: "Retours" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  await requireRole(["super_admin", "admin", "manager", "scanner_agent"]);
  const [returns, summary] = await Promise.all([getReturns(), getReturnsSummary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Retours</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestion des retours et calcul des pertes.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total retours" value={summary.total}                  />
        <KpiCard label="Bon état"      value={summary.good}      positive     />
        <KpiCard label="Endommagés"    value={summary.damaged}   negative={summary.damaged > 0} />
        <KpiCard label="Perdus"        value={summary.lost}      negative={summary.lost > 0} />
        <KpiCard label="Perte totale"  value={formatMAD(summary.totalLoss)}  negative={summary.totalLoss > 0} />
        <KpiCard label="À réclamer"    value={formatMAD(summary.totalClaim)} info={summary.totalClaim > 0} />
      </div>

      {/* List */}
      {returns.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16">
          <RotateCcw className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">Aucun retour</p>
          <p className="text-xs text-muted-foreground mt-1">Les retours scannés apparaîtront ici.</p>
          <Link href="/admin/scanner?mode=return"
            className="mt-4 text-sm text-primary hover:underline">
            Aller au scanner →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["N° retour","Commande","Client","Condition","Statut","Perte","À réclamer","Date",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium">{r.return_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${r.order_id}`}
                        className="font-mono text-xs hover:underline text-muted-foreground">
                        {r.order_number ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{r.customer_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <ReturnConditionBadge condition={r.condition} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{r.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {(r.total_loss_mad ?? 0) > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-red-600 font-mono font-medium">
                          <TrendingDown className="h-3 w-3" />
                          {formatMAD(r.total_loss_mad)}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {(r.claim_amount_mad ?? 0) > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-amber-600 font-mono font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          {formatMAD(r.claim_amount_mad)}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("fr-MA")}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/returns/${r.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Détails →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, positive, negative, info }: {
  label: string; value: string | number;
  positive?: boolean; negative?: boolean; info?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 space-y-1",
      positive && "border-green-200 bg-green-50/40",
      negative && "border-red-200 bg-red-50/40",
      info     && "border-amber-200 bg-amber-50/40"
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        "text-lg font-bold font-mono",
        positive && "text-green-700",
        negative && "text-red-600",
        info     && "text-amber-700"
      )}>{value}</p>
    </div>
  );
}
