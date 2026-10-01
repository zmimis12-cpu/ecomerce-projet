import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { loadEditorContext } from "@/lib/creatives/editor-context";
import { getEditorDeliveries } from "@/lib/creatives/queries";
import { EditorHeader } from "@/components/creatives/editor-sections";
import { StatusBadge } from "@/components/orders/status-badge";
import { DigylogStatusBadge } from "@/components/orders/digylog-status-badge";
import { mad } from "@/components/creatives/period-filter";
import type { OrderStatus } from "@/types/orders";

export const metadata: Metadata = { title: "Suivi des livraisons" };
export const dynamic = "force-dynamic";

const GROUPS: { key: string; label: string; match: (s: string) => boolean; cls: string }[] = [
  { key: "pending",   label: "En attente / confirmation", match: (s) => ["new", "no_answer", "confirmed", "callback"].includes(s), cls: "text-gray-700" },
  { key: "shipping",  label: "En livraison",               match: (s) => ["sent_to_delivery", "in_transit"].includes(s), cls: "text-blue-700" },
  { key: "delivered", label: "Livrées",                    match: (s) => ["delivered", "paid"].includes(s), cls: "text-emerald-700" },
  { key: "lost",      label: "Retours / annulées",         match: (s) => ["returned", "refused_delivery", "cancelled"].includes(s), cls: "text-red-700" },
];

export default async function EditorDeliveriesPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await loadEditorContext(await searchParams);
  const rows = await getEditorDeliveries({ editorId: ctx.editorId, month: ctx.report.period });
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Africa/Casablanca" }) : "—");

  return (
    <div className="space-y-6">
      <EditorHeader ctx={ctx} title="Suivi des livraisons" icon={Truck} current="/admin/editor/deliveries" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{g.label}</div>
            <div className={`mt-1 text-lg font-semibold ${g.cls}`}>{rows.filter((r) => g.match(r.status)).length}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Commandes de mes vidéos ({rows.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">Statut en direct de la livraison. Les informations des clients ne sont pas affichées.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Commande</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Vidéo</th>
                <th className="px-4 py-2">Produit</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Livraison (Digylog)</th>
                <th className="px-4 py-2">Livrée le</th>
                <th className="px-4 py-2 text-right">Mon gain</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucune commande sur cette période.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.orderNumber} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{r.orderNumber}</td>
                  <td className="px-4 py-2">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-2 font-mono font-semibold">{r.code}</td>
                  <td className="px-4 py-2">{r.productName}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status as OrderStatus} /></td>
                  <td className="px-4 py-2">
                    {r.dgLabel ? <DigylogStatusBadge label={r.dgLabel} id={r.dgId} reportedTo={r.reportedTo} compact /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2">{fmt(r.deliveredAt)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{r.earning != null ? mad(r.earning) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
