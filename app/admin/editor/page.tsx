import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getProductCards } from "@/lib/creatives/portal";
import { getProductRates } from "@/lib/creatives/product-rates";
import { periodRange } from "@/lib/creatives/queries";
import { EditorHeader, StatCards, BalanceCards, VideosTable, PayPlanCard, ProductSummary } from "@/components/creatives/editor-sections";

export const metadata: Metadata = { title: "Tableau de bord éditeur" };
export const dynamic = "force-dynamic";

export default async function EditorDashboardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const q = ctx.isEditor ? `?month=${ctx.report.period}` : `?editor=${ctx.editorId}&month=${ctx.report.period}`;
  const ids = [...new Set(ctx.report.creatives.map((c) => c.productId).filter(Boolean) as string[])];
  const { from: pFrom, to: pTo } = periodRange(ctx.report.period);
  const [cards, rates] = await Promise.all([getProductCards(ids), getProductRates(ids, pFrom, pTo)]);
  // Taux réels du produit (toutes ses commandes, mêmes formules que l'admin)
  const products = cards.map((p) => ({ ...p, rates: rates.get(p.id) }));
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title="Tableau de bord" icon={LayoutDashboard} current="/admin/editor" />
      <StatCards ctx={ctx} />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <PayPlanCard ctx={ctx} />
        <div className="space-y-3">
          <BalanceCards ctx={ctx} />
          <Link href={`/admin/editor/payments${q}`} className="inline-block text-xs text-primary hover:underline">Voir l&apos;historique des paiements →</Link>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Mes produits</h2>
          <Link href={`/admin/editor/videos${q}`} className="text-xs text-primary hover:underline">Toutes les vidéos par produit →</Link>
        </div>
        <ProductSummary ctx={ctx} products={products} />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">Top vidéos (période)</h2>
          <Link href={`/admin/editor/videos${q}`} className="text-xs text-primary hover:underline">Tout voir →</Link>
        </div>
        <VideosTable ctx={ctx} limit={5} />
      </section>
    </div>
  );
}
