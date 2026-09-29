import type { Metadata } from "next";
import { CheckCircle } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { EditorHeader, DeliveredTable } from "@/components/creatives/editor-sections";
import { mad } from "@/components/creatives/period-filter";

export const metadata: Metadata = { title: "Commandes livrées" };
export const dynamic = "force-dynamic";

export default async function EditorOrdersPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const total = ctx.report.deliveredOrders.reduce((s, o) => s + o.earning, 0);
  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title="Commandes livrées" icon={CheckCircle} current="/admin/editor/orders" />
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-medium">{ctx.report.deliveredOrders.length} commande(s) livrée(s)</h2>
          <span className="text-sm">Gain : <b className="text-emerald-700">{mad(total)}</b></span>
        </div>
        <DeliveredTable ctx={ctx} />
      </section>
    </div>
  );
}
