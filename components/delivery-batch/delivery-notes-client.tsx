"use client";
import { useState, useTransition } from "react";
import { Search, Loader2, Printer, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadBatchLabels } from "@/lib/delivery/batch/actions";

// ── Types ─────────────────────────────────────────────────────────────────────
type Batch = {
  id: string;
  batch_number: string;
  status: string;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  created_at: string;
  labels_downloaded_at: string | null;
};

interface Props {
  rows:      Batch[];
  stores:    string[];
  companies: string[];
}

// ── Ticket status config ──────────────────────────────────────────────────────
const TICKET_STATUS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  draft:             { label: "Non imprimé",  icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sent:              { label: "Non imprimé",  icon: Clock,        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  tickets_printed:   { label: "Imprimé ✓",   icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  labels_downloaded: { label: "Imprimé ✓",   icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  bl_generated:      { label: "Imprimé ✓",   icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  completed:         { label: "Terminé",      icon: CheckCircle2, cls: "bg-slate-100 text-slate-600 border-slate-200" },
  cancelled:         { label: "Annulé",       icon: XCircle,      cls: "bg-red-50 text-red-600 border-red-200" },
};

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ── Print tickets button ──────────────────────────────────────────────────────
function PrintButton({ batch }: { batch: Batch }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const alreadyPrinted = !!batch.labels_downloaded_at;

  function handlePrint(e: React.MouseEvent) {
    e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      const r = await downloadBatchLabels(batch.id);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `tickets-${batch.batch_number}.pdf`);
        setMsg({ ok: true, text: "✓ Téléchargé" });
        setTimeout(() => window.location.reload(), 800);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handlePrint}
        disabled={isPending}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
          alreadyPrinted
            ? "border border-dashed border-border text-muted-foreground hover:text-foreground"
            : "bg-primary text-primary-foreground hover:opacity-90"
        )}
      >
        {isPending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Printer className="h-3.5 w-3.5" />}
        {alreadyPrinted ? "Réimprimer" : "Imprimer tickets 10×10"}
      </button>
      {msg && (
        <span className={cn("text-[10px] font-medium", msg.ok ? "text-green-700" : "text-red-600")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DeliveryNotesClient({ rows, stores, companies }: Props) {
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

  const SEL = "h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Delivery Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Groupes de tickets — {rows.length} groupe(s)
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">
                · {pendingCount} à imprimer
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Printer className="h-3.5 w-3.5" />
          {showAll ? "Masquer imprimés" : "Afficher tous"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher batch, store…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
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
                {["Batch ID", "Transporteur", "Store", "Commandes", "Statut tickets", "Imprimé le", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((b) => {
                const sCfg = TICKET_STATUS[b.status] ?? TICKET_STATUS.draft;
                const SIcon = sCfg.icon;
                const printed = !!b.labels_downloaded_at;

                return (
                  <tr key={b.id} className={cn(
                    "hover:bg-secondary/20 transition-colors",
                    printed && "opacity-70"
                  )}>
                    {/* Batch ID */}
                    <td className="px-5 py-3.5">
                      <p className="font-mono font-bold text-sm">{b.batch_number}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(b.created_at).toLocaleDateString("fr-MA", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </td>

                    {/* Provider */}
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-[10px] font-semibold">
                        {b.shipping_company ?? "Digylog"}
                      </span>
                    </td>

                    {/* Store */}
                    <td className="px-5 py-3.5 text-sm font-medium">
                      {b.store_name ?? "—"}
                    </td>

                    {/* Orders */}
                    <td className="px-5 py-3.5 text-sm font-bold text-center">
                      {b.total_orders}
                    </td>

                    {/* Ticket status */}
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold",
                        sCfg.cls
                      )}>
                        <SIcon className="h-2.5 w-2.5" />
                        {sCfg.label}
                      </span>
                    </td>

                    {/* Printed at */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {b.labels_downloaded_at
                        ? new Date(b.labels_downloaded_at).toLocaleDateString("fr-MA", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })
                        : "—"}
                    </td>

                    {/* Actions — tickets only */}
                    <td className="px-5 py-3.5">
                      <PrintButton batch={b} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-secondary/10 px-5 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} groupe(s)</span>
            <span>Total: {filtered.reduce((s, r) => s + r.total_orders, 0)} commandes</span>
          </div>
        </div>
      )}
    </div>
  );
}
