"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Loader2, Printer, CheckCircle2, Clock, XCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateRecapAndLabels } from "@/lib/delivery/batch/actions";

type Batch = {
  id: string;
  batch_number: string;
  status: string;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  total_products: number;
  created_at: string;
  labels_downloaded_at: string | null;
};

type ProductSummary = {
  batch_id: string;
  product_name: string;
  sku: string | null;
  total_quantity: number;
  order_count: number;
};

interface Props {
  rows:             Batch[];
  stores:           string[];
  companies:        string[];
  productsByBatch:  Record<string, ProductSummary[]>;
}

const TICKET_STATUS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  draft:             { label: "Non imprimé", icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sent:              { label: "Non imprimé", icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  tickets_printed:   { label: "Imprimé ✓",  icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  labels_downloaded: { label: "Imprimé ✓",  icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  bl_generated:      { label: "Imprimé ✓",  icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  completed:         { label: "Terminé",     icon: CheckCircle2, cls: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled:         { label: "Annulé",      icon: XCircle,      cls: "bg-red-50 text-red-600 border-red-200" },
};

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ── Print button ──────────────────────────────────────────────────────────────
function PrintButton({ batch }: { batch: Batch }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const printed = !!batch.labels_downloaded_at;

  function handlePrint(e: React.MouseEvent) {
    e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      const r = await generateRecapAndLabels(batch.id);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `recap-tickets-${batch.batch_number}.pdf`);
        const text = r.warning
          ? `✓ ${r.labelsOk ?? r.totalTrackings} tickets — ⚠ ${r.warning}`
          : `✓ ${r.totalTrackings} tickets`;
        setMsg({ ok: true, text });
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={handlePrint} disabled={isPending}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap",
          printed
            ? "border border-dashed border-border text-muted-foreground hover:text-foreground"
            : "bg-primary text-primary-foreground hover:opacity-90"
        )}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
        {printed ? "Réimprimer" : "Imprimer tickets"}
      </button>
      {msg && (
        <span className={cn("text-[10px] font-medium", msg.ok ? "text-green-700" : "text-red-600")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

// ── Product chip ──────────────────────────────────────────────────────────────
function ProductChip({ p, rank }: { p: ProductSummary; rank: number }) {
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-violet-100 text-violet-800",
    "bg-amber-100 text-amber-800",
  ];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", colors[rank] ?? "bg-slate-100 text-slate-700")}>
      {p.product_name.length > 20 ? p.product_name.slice(0, 20) + "…" : p.product_name}
      <span className="font-bold">×{p.total_quantity}</span>
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DeliveryNotesClient({ rows, stores, companies, productsByBatch }: Props) {
  const [search,  setSearch]  = useState("");
  const [store,   setStore]   = useState("all");
  const [company, setCompany] = useState("all");
  const [showAll, setShowAll] = useState(true);

  const q = search.toLowerCase().trim();
  const filtered = rows.filter((r) => {
    if (!showAll && r.labels_downloaded_at) return false;
    if (q && !r.batch_number.toLowerCase().includes(q) &&
        !(r.store_name ?? "").toLowerCase().includes(q)) return false;
    if (store   !== "all" && r.store_name !== store) return false;
    if (company !== "all" && (r.shipping_company ?? "Digylog") !== company) return false;
    return true;
  });

  const pendingCount = rows.filter((r) => !r.labels_downloaded_at).length;
  const SEL = "h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Delivery Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} groupe(s) de tickets
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">· {pendingCount} à imprimer</span>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <Printer className="h-3.5 w-3.5" />
          {showAll ? "Masquer imprimés" : "Afficher tous"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher batch, store…"
            className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={store} onChange={(e) => setStore(e.target.value)} className={SEL}>
          <option value="all">Tous les stores</option>
          {stores.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={company} onChange={(e) => setCompany(e.target.value)} className={SEL}>
          <option value="all">Tous les transporteurs</option>
          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-card flex flex-col items-center justify-center py-16 gap-3">
          <Printer className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">
            {showAll ? "Aucun groupe" : "Tous les tickets ont été imprimés ✓"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Batch","Store","Commandes","Produits à préparer","Statut","Imprimé le","Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((b) => {
                const sCfg    = TICKET_STATUS[b.status] ?? TICKET_STATUS.draft;
                const SIcon   = sCfg.icon;
                const printed = !!b.labels_downloaded_at;
                const topProds = productsByBatch[b.id] ?? [];

                return (
                  <tr key={b.id}
                    className={cn("hover:bg-secondary/20 transition-colors group cursor-pointer", printed && "opacity-70")}
                    onClick={() => { window.location.href = `/admin/delivery/notes/${b.id}`; }}>

                    {/* Batch */}
                    <td className="px-4 py-3.5">
                      <p className="font-mono font-bold text-sm">{b.batch_number}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(b.created_at).toLocaleDateString("fr-MA", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </td>

                    {/* Store */}
                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-full bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-[10px] font-semibold">
                        {b.shipping_company ?? "Digylog"}
                      </span>
                      <p className="text-xs font-medium mt-1">{b.store_name ?? "—"}</p>
                    </td>

                    {/* Orders */}
                    <td className="px-4 py-3.5 text-center">
                      <p className="text-sm font-bold">{b.total_orders}</p>
                      <p className="text-[10px] text-muted-foreground">{b.total_products} unités</p>
                    </td>

                    {/* Product summary — top 3 */}
                    <td className="px-4 py-3.5">
                      {topProds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {topProds.map((p, i) => <ProductChip key={p.product_name} p={p} rank={i} />)}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Ticket status */}
                    <td className="px-4 py-3.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold", sCfg.cls)}>
                        <SIcon className="h-2.5 w-2.5" />{sCfg.label}
                      </span>
                    </td>

                    {/* Printed at */}
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                      {b.labels_downloaded_at
                        ? new Date(b.labels_downloaded_at).toLocaleDateString("fr-MA", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
                        : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <PrintButton batch={b} />
                        <Link href={`/admin/delivery/notes/${b.id}`}
                          className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}>
                          Détail <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-secondary/10 px-4 py-3 flex justify-between text-xs text-muted-foreground">
            <span>{filtered.length} groupe(s)</span>
            <span>Total: {filtered.reduce((s, r) => s + r.total_orders, 0)} commandes</span>
          </div>
        </div>
      )}
    </div>
  );
}
