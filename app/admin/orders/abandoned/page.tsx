import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listAbandonedCarts, abandonedStats, getAbandonedWaTemplate, DEFAULT_ABANDONED_WA } from "@/lib/orders/abandoned";
import { AbandonedWaTemplateEditor } from "@/components/orders/abandoned-wa-template";
import { AbandonedTable } from "@/components/orders/abandoned-table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Paniers abandonnés" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "pending", label: "À appeler" },
  { key: "called", label: "Appelés" },
  { key: "converted", label: "Commandes créées" },
  { key: "not_interested", label: "Pas intéressés" },
  { key: "all", label: "Tous" },
];

export default async function AbandonedPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const status = TABS.some((t) => t.key === s) ? s! : "pending";
  const session = await requireRole(["super_admin", "admin", "manager", "call_center_agent"]);
  const [{ rows, missingTable }, st, waTemplate] = await Promise.all([listAbandonedCarts({ status, days: 7 }), abandonedStats(7), getAbandonedWaTemplate()]);
  const canEdit = ["super_admin", "admin", "manager"].includes(session.role);
  const rate = st.total ? Math.round((st.converted / st.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">🛒 Paniers abandonnés</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clients qui ont tapé leur téléphone sur la landing page sans envoyer la commande (7 derniers jours).
          Ils apparaissent ici 30 min après — appelez-les, puis « Créer la commande » s&apos;ils disent oui.
        </p>
      </div>

      {missingTable ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          La table <b>abandoned_carts</b> n&apos;existe pas encore : exécutez <code>supabase/migrations/20261023000000_abandoned_carts.sql</code> dans Supabase → SQL Editor.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["Paniers", st.total], ["À appeler", st.pending], ["Appelés", st.called], ["Commandes créées", st.converted], ["Récupération", `${rate}%`]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold">{v}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <Link key={t.key} href={`/admin/orders/abandoned?s=${t.key}`}
                className={cn("rounded-full border px-3 py-1.5 text-sm", status === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {t.label}
              </Link>
            ))}
          </div>
          {canEdit && <AbandonedWaTemplateEditor initial={waTemplate} fallback={DEFAULT_ABANDONED_WA} />}
          <AbandonedTable rows={rows} waTemplate={waTemplate} />
        </>
      )}
    </div>
  );
}
