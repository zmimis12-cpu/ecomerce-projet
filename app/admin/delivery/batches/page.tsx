import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Package, Plus, Send, FileDown, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tickets Impression" };
export const dynamic = "force-dynamic";

const STATUS_CFG = {
  draft:              { label:"Brouillon",         cls:"bg-gray-100 text-gray-700" },
  sent:               { label:"Envoyé Digylog",    cls:"bg-blue-100 text-blue-800" },
  labels_downloaded:  { label:"Tickets téléchargés",cls:"bg-violet-100 text-violet-800" },
  bl_downloaded:      { label:"BL téléchargé",     cls:"bg-green-100 text-green-800" },
  completed:          { label:"Terminé",            cls:"bg-emerald-100 text-emerald-800" },
} as const;

export default async function BatchesPage() {
  await requireRole(["super_admin","admin","manager"]);

  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,status,total_orders,total_products,bl_id,sent_at,created_at")
    .order("created_at", { ascending: false });

  type Batch = {
    id: string; batch_number: string; status: string;
    total_orders: number; total_products: number;
    bl_id: number | null; sent_at: string | null; created_at: string;
  };
  const rows = (batches ?? []) as Batch[];

  const stats = {
    total:     rows.length,
    draft:     rows.filter((r) => r.status === "draft").length,
    sent:      rows.filter((r) => r.status === "sent").length,
    completed: rows.filter((r) => r.status === "completed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tickets Impression</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gérez vos envois groupés vers Digylog.
          </p>
        </div>
        <Link href="/admin/delivery/batches/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Nouveau groupe
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Total groupes",  value:stats.total,     icon:Package },
          { label:"Brouillons",     value:stats.draft,     icon:Package },
          { label:"Envoyés",        value:stats.sent,      icon:Send },
          { label:"Terminés",       value:stats.completed, icon:CheckCircle },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 space-y-2">
            <s.icon className="h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
          <Package className="h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Aucun groupe créé</p>
          <Link href="/admin/delivery/batches/new"
            className="text-xs text-primary hover:underline">
            Créer votre premier groupe →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Groupe","Statut","Commandes","Produits","BL","Envoyé","Créé",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((b) => {
                  const cfg = STATUS_CFG[b.status as keyof typeof STATUS_CFG] ?? { label:b.status, cls:"bg-gray-100 text-gray-600" };
                  return (
                    <tr key={b.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold">{b.batch_number}</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", cfg.cls)}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-center">{b.total_orders}</td>
                      <td className="px-4 py-3 font-mono text-center">{b.total_products}</td>
                      <td className="px-4 py-3 font-mono">
                        {b.bl_id
                          ? <span className="text-violet-700 font-semibold">#{b.bl_id}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {b.sent_at ? new Date(b.sent_at).toLocaleDateString("fr-MA") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(b.created_at).toLocaleDateString("fr-MA")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/delivery/batches/${b.id}`}
                          className="text-xs text-primary hover:underline">
                          Détails →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
