import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import {
  Package, Truck, CheckCircle, Clock, XCircle,
  FileDown, ChevronRight, BarChart3,
} from "lucide-react";

export const metadata: Metadata = { title: "Delivery Notes" };
export const dynamic = "force-dynamic";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CFG = {
  draft:              { label:"Brouillon",      color:"bg-slate-100 text-slate-700 border-slate-200",       icon:Clock },
  sent:               { label:"Envoyé",         color:"bg-blue-100 text-blue-800 border-blue-200",          icon:Truck },
  labels_downloaded:  { label:"Tickets prêts",  color:"bg-violet-100 text-violet-800 border-violet-200",    icon:FileDown },
  bl_downloaded:      { label:"BL téléchargé",  color:"bg-amber-100 text-amber-800 border-amber-200",       icon:FileDown },
  completed:          { label:"Terminé",         color:"bg-emerald-100 text-emerald-800 border-emerald-200", icon:CheckCircle },
  cancelled:          { label:"Annulé",          color:"bg-red-100 text-red-700 border-red-200",             icon:XCircle },
} as const;

const PAY_CFG = {
  unpaid:   { label:"Non payé",     color:"bg-red-100 text-red-700" },
  partial:  { label:"Partiel",      color:"bg-amber-100 text-amber-800" },
  paid:     { label:"Payé",         color:"bg-green-100 text-green-800" },
} as const;

type Batch = {
  id: string; batch_number: string; status: string;
  payment_status: string | null; bl_id: number | null;
  total_orders: number; total_products: number;
  store_name: string | null; shipping_company: string | null;
  sent_at: string | null; created_at: string;
  notes: string | null;
};

function mad(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0 }) + " MAD";
}

export default async function DeliveryNotesPage() {
  await requireRole(["super_admin","admin","manager"]);

  const { data: batches } = await supabaseAdmin
    .from("delivery_batches")
    .select("id,batch_number,status,payment_status,bl_id,total_orders,total_products,store_name,shipping_company,sent_at,created_at,notes")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (batches ?? []) as Batch[];

  // Aggregate totals for quick stats
  const totals = {
    all:       rows.length,
    sent:      rows.filter((r) => r.status === "sent").length,
    completed: rows.filter((r) => r.status === "completed").length,
    unpaid:    rows.filter((r) => !r.payment_status || r.payment_status === "unpaid").length,
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Delivery Notes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tous vos groupes d&apos;expédition Digylog centralisés.
          </p>
        </div>
        <Link href="/admin/delivery/sheet-sync"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Truck className="h-4 w-4" />
          Sync Google Sheet → Digylog
        </Link>
      </div>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Total BLs",       value:totals.all,       icon:Package,      color:"" },
          { label:"En cours",        value:totals.sent,       icon:Truck,        color:"text-blue-700" },
          { label:"Terminés",        value:totals.completed,  icon:CheckCircle,  color:"text-emerald-700" },
          { label:"Non payés",       value:totals.unpaid,     icon:BarChart3,    color:totals.unpaid > 0 ? "text-red-600" : "" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4 space-y-2">
            <s.icon className={cn("h-4 w-4 text-muted-foreground", s.color)} />
            <p className={cn("text-2xl font-bold tracking-tight", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed bg-card flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
            <Package className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm">Aucun delivery note</p>
            <p className="text-xs text-muted-foreground mt-1">
              Synchronisez votre Google Sheet pour créer le premier.
            </p>
          </div>
          <Link href="/admin/delivery/sheet-sync"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Commencer →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40">
                  {["BL / Groupe","Statut","Paiement","Commandes","Produits","BL Digylog","Store","Créé",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((b) => {
                  const sCfg = STATUS_CFG[b.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.draft;
                  const pCfg = PAY_CFG[(b.payment_status ?? "unpaid") as keyof typeof PAY_CFG] ?? PAY_CFG.unpaid;
                  const Icon = sCfg.icon;

                  return (
                    <tr key={b.id} className="hover:bg-secondary/20 transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-mono font-bold text-sm">{b.batch_number}</p>
                        {b.notes && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate">{b.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
                          sCfg.color
                        )}>
                          <Icon className="h-2.5 w-2.5" />
                          {sCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold", pCfg.color)}>
                          {pCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-center">{b.total_orders}</td>
                      <td className="px-4 py-3 font-mono text-center text-muted-foreground">{b.total_products}</td>
                      <td className="px-4 py-3">
                        {b.bl_id
                          ? <span className="font-mono font-bold text-violet-700">#{b.bl_id}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{b.store_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(b.created_at).toLocaleDateString("fr-MA", {
                          day:"numeric", month:"short", hour:"2-digit", minute:"2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/delivery/notes/${b.id}`}
                          className="flex items-center gap-0.5 text-xs font-medium text-primary hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
                          Voir <ChevronRight className="h-3 w-3" />
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
