import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { listProducts, productEconomicsDetail } from "@/lib/products/economics";
import { PeriodFilter, currentMonth } from "@/components/creatives/period-filter";

export const metadata: Metadata = { title: "Calculs par produit" };
export const dynamic = "force-dynamic";

const mad = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} MAD`);
const pct = (n: number) => `${Math.round(n * 100)} %`;

export default async function ProductCalcListPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const sp = await searchParams;
  const period = sp.month ?? currentMonth();
  const products = (await listProducts()).filter((p) => p.is_active);
  const rows = await Promise.all(products.map(async (p) => ({ p, e: await productEconomicsDetail(p.id, period) })));
  const active = rows.filter((r) => r.e.counts.leads > 0 || r.e.money.adSpend > 0).sort((a, b) => b.e.money.adSpend - a.e.money.adSpend);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><Calculator className="h-5 w-5 text-primary" /> Calculs par produit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Clique sur un produit pour voir chaque calcul expliqué ligne par ligne.</p>
        </div>
        <PeriodFilter period={period} />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Produit</th><th className="px-4 py-2 text-right">Commandes</th><th className="px-4 py-2 text-right">Livrées</th>
              <th className="px-4 py-2 text-right">Confirm. × Livr.</th><th className="px-4 py-2 text-right">Pub</th>
              <th className="px-4 py-2 text-right">Coût / commande</th><th className="px-4 py-2 text-right">Max rentable</th>
              <th className="px-4 py-2 text-right">Profit net encaissé</th><th className="px-4 py-2 text-right">+ En attente</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">Aucune activité sur cette période.</td></tr>}
            {active.map(({ p, e }) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-2"><Link href={`/admin/products/calculs/${p.id}?month=${period}`} className="font-medium text-primary hover:underline">{p.name}</Link></td>
                <td className="px-4 py-2 text-right">{e.counts.leads}</td>
                <td className="px-4 py-2 text-right">{e.counts.delivered}</td>
                <td className="px-4 py-2 text-right">{pct(e.rates.confirmRate)} × {pct(e.rates.deliveryRate)}</td>
                <td className="px-4 py-2 text-right">{mad(e.money.adSpend)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${e.unit.cpo != null && e.unit.cpo > e.unit.breakEvenCpo ? "text-red-600" : "text-emerald-700"}`}>{mad(e.unit.cpo)}</td>
                <td className="px-4 py-2 text-right">{mad(e.unit.breakEvenCpo)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${e.money.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{mad(e.money.netProfit)}</td>
                <td className="px-4 py-2 text-right text-amber-700">{mad(e.money.pendingMargin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
