"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Loader2, CheckCircle2, Clock, Truck, FileDown, XCircle, Send, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadBatchLabels, sendBatchGetBl } from "@/lib/delivery/batch/actions";
import { getBlPdfByBlId } from "@/lib/delivery/document-actions";

type Batch = {
  id: string;
  batch_number: string;
  bl_id: number | null;
  status: string;
  payment_status: string | null;
  shipping_company: string | null;
  store_name: string | null;
  total_orders: number;
  total_products: number;
  sent_at: string | null;
  created_at: string;
  notes: string | null;
  labels_downloaded_at: string | null;
};

interface Props {
  rows:      Batch[];
  stores:    string[];
  companies: string[];
}

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  draft:              { label:"DRAFT",       icon:Clock,         cls:"bg-slate-100 text-slate-600 border-slate-200" },
  sent:               { label:"ENVOYÉ",      icon:Truck,         cls:"bg-blue-100 text-blue-700 border-blue-200" },
  labels_downloaded:  { label:"TICKETS OK",  icon:Printer,       cls:"bg-violet-100 text-violet-700 border-violet-200" },
  bl_downloaded:      { label:"BL OK",       icon:FileDown,      cls:"bg-amber-100 text-amber-700 border-amber-200" },
  completed:          { label:"TERMINÉ",     icon:CheckCircle2,  cls:"bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled:          { label:"ANNULÉ",      icon:XCircle,       cls:"bg-red-100 text-red-600 border-red-200" },
};

const PAY_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:  { label:"Non payé", cls:"bg-red-50 text-red-500 border-red-200" },
  partial: { label:"Partiel",  cls:"bg-amber-50 text-amber-600 border-amber-200" },
  paid:    { label:"Payé",     cls:"bg-green-50 text-green-600 border-green-200" },
};

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// ── Row actions ───────────────────────────────────────────────────────────────
function RowActions({ batch }: { batch: Batch }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const alreadyPrinted = !!batch.labels_downloaded_at;
  const hasBlId        = !!batch.bl_id;
  const noBlId         = !batch.bl_id;

  function handleTickets(e: React.MouseEvent) {
    e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      const r = await downloadBatchLabels(batch.id);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `tickets-${batch.batch_number}.pdf`);
        setMsg({ ok: true, text: "✓ Tickets téléchargés" });
        // Reload to show updated status
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur tickets" });
      }
    });
  }

  function handleSendGetBl(e: React.MouseEvent) {
    e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      const r = await sendBatchGetBl(batch.id);
      if (r.ok) {
        setMsg({ ok: true, text: `✓ BL #${r.bl}` });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* TICKETS button — primary action */}
      {alreadyPrinted ? (
        // Already printed — show muted reprint option
        <button type="button" onClick={handleTickets} disabled={isPending}
          title="Réimprimer les tickets"
          className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-40 transition-colors">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          Réimprimer
        </button>
      ) : (
        // Not yet printed — prominent tickets button
        <button type="button" onClick={handleTickets} disabled={isPending}
          title="Télécharger les tickets 10×10"
          className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          Tickets
        </button>
      )}

      {/* BL button — secondary */}
      {noBlId ? (
        <button type="button" onClick={handleSendGetBl} disabled={isPending}
          title="Envoyer à Digylog pour obtenir le BL"
          className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Get BL
        </button>
      ) : (
        <span className="text-[10px] font-mono text-violet-700 font-bold">
          BL #{batch.bl_id}
        </span>
      )}

      {msg && (
        <span className={cn("text-[10px] font-medium max-w-[100px]",
          msg.ok ? "text-green-700" : "text-red-600")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function DeliveryNotesClient({ rows, stores, companies }: Props) {
  const [search,  setSearch]  = useState("");
  const [store,   setStore]   = useState("all");
  const [company, setCompany] = useState("all");
  const [payment, setPayment] = useState("all");
  const [showPrinted, setShowPrinted] = useState(true);

  const q = search.toLowerCase().trim();
  const filtered = rows.filter((r) => {
    if (!showPrinted && r.labels_downloaded_at) return false;
    if (q) {
      const blStr = r.bl_id ? String(r.bl_id) : "";
      if (!blStr.includes(q) && !r.batch_number.toLowerCase().includes(q) &&
          !(r.store_name ?? "").toLowerCase().includes(q)) return false;
    }
    if (store   !== "all" && r.store_name !== store) return false;
    if (company !== "all" && (r.shipping_company ?? "Digylog") !== company) return false;
    if (payment !== "all" && (r.payment_status ?? "unpaid") !== payment) return false;
    return true;
  });

  const pendingTickets = rows.filter((r) => !r.labels_downloaded_at).length;

  const SEL = "h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Delivery Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} groupe(s) — {pendingTickets > 0 && (
              <span className="text-amber-600 font-semibold">{pendingTickets} ticket(s) à imprimer</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle: show/hide already printed */}
          <button type="button"
            onClick={() => setShowPrinted((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
              showPrinted
                ? "border-border bg-background text-muted-foreground hover:bg-secondary"
                : "border-primary bg-primary/10 text-primary"
            )}>
            <Printer className="h-3.5 w-3.5" />
            {showPrinted ? "Masquer imprimés" : "Afficher tous"}
          </button>
          <Link href="/admin/delivery/sheet-sync"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            <Truck className="h-4 w-4" />
            Sync Sheet → Digylog
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search BL ID, batch, store…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <select value={store} onChange={(e) => setStore(e.target.value)} className={SEL}>
            <option value="all">All Stores</option>
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={SEL}>
            <option value="all">All Shipping Companies</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={SEL}>
            <option value="all">All Payment Status</option>
            <option value="unpaid">Non payé</option>
            <option value="partial">Partiel</option>
            <option value="paid">Payé</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-card flex flex-col items-center justify-center py-16 gap-3">
          <Printer className="h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground font-medium">
            {showPrinted ? "Aucun résultat" : "Tous les tickets ont été imprimés ✓"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["BL ID","SHIPPING","STORE","ORDERS","STATUS","PAYMENT","TICKETS & BL"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((b) => {
                const sCfg = STATUS_CFG[b.status] ?? STATUS_CFG.draft;
                const pCfg = PAY_CFG[b.payment_status ?? "unpaid"] ?? PAY_CFG.unpaid;
                const SIcon = sCfg.icon;
                const printed = !!b.labels_downloaded_at;

                return (
                  <tr key={b.id}
                    onClick={() => { window.location.href = `/admin/delivery/notes/${b.id}`; }}
                    className={cn(
                      "hover:bg-secondary/20 transition-colors cursor-pointer",
                      printed && "opacity-60"
                    )}>
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold text-sm">{b.bl_id ?? b.batch_number}</p>
                      {printed && (
                        <p className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Imprimé {new Date(b.labels_downloaded_at!).toLocaleDateString("fr-MA")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-[10px] font-semibold">
                        {b.shipping_company ?? "Digylog"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">{b.store_name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-bold text-center">{b.total_orders}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase", sCfg.cls)}>
                        <SIcon className="h-2.5 w-2.5" />{sCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold", pCfg.cls)}>
                        {pCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <RowActions batch={b} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t bg-secondary/10 px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} résultat(s) sur {rows.length}</span>
            <span>Total: {filtered.reduce((s, r) => s + r.total_orders, 0)} commandes</span>
          </div>
        </div>
      )}
    </div>
  );
}
