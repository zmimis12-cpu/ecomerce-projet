"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Download, Loader2, CheckCircle2, Clock, Truck, FileDown, XCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadBatchLabels, downloadBatchBl, sendBatchGetBl } from "@/lib/delivery/batch/actions";
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
};

interface Props {
  rows:      Batch[];
  stores:    string[];
  companies: string[];
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  draft:             { label:"DRAFT",      icon:Clock,          cls:"bg-slate-100 text-slate-600 border-slate-200" },
  sent:              { label:"SENT",       icon:Truck,          cls:"bg-blue-100 text-blue-700 border-blue-200" },
  labels_downloaded: { label:"LABELS OK",  icon:FileDown,       cls:"bg-violet-100 text-violet-700 border-violet-200" },
  bl_downloaded:     { label:"BL OK",      icon:FileDown,       cls:"bg-amber-100 text-amber-700 border-amber-200" },
  completed:         { label:"COMPLETED",  icon:CheckCircle2,   cls:"bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelled:         { label:"CANCELLED",  icon:XCircle,        cls:"bg-red-100 text-red-600 border-red-200" },
};

const PAY_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:  { label:"Unpaid",  cls:"bg-red-50 text-red-500 border-red-200" },
  partial: { label:"Partial", cls:"bg-amber-50 text-amber-600 border-amber-200" },
  paid:    { label:"Paid",    cls:"bg-green-50 text-green-600 border-green-200" },
};

function downloadBlob(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

function ActionBtn({ batch }: { batch: Batch }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isDraft = batch.status === "draft" && !batch.bl_id;

  function handleSend(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      const r = await sendBatchGetBl(batch.id) as { ok?: boolean; bl?: number; error?: string };
      if (r.ok && r.bl) {
        setMsg({ ok: true, text: `BL #${r.bl}` });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  function handleDownload(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    setMsg(null);
    startTransition(async () => {
      if (batch.bl_id) {
        const r = await downloadBatchBl(batch.id);
        if (r.ok && r.blobBase64) { downloadBlob(r.blobBase64, `BL-${batch.bl_id}.pdf`); return; }
      }
      const r = await downloadBatchLabels(batch.id);
      if (r.ok && r.blobBase64) {
        downloadBlob(r.blobBase64, `labels-${batch.batch_number}.pdf`);
      } else {
        setMsg({ ok: false, text: r.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Send button for drafts without BL */}
      {isDraft && (
        <button type="button" onClick={handleSend} disabled={isPending}
          title="Envoyer à Digylog pour obtenir le BL"
          className={cn(
            "flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 text-primary",
            "px-2 py-1.5 text-[10px] font-bold hover:bg-primary/20 transition-colors",
            isPending && "opacity-50 cursor-not-allowed"
          )}>
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Envoyer
        </button>
      )}
      {/* Download button */}
      <button type="button" onClick={handleDownload} disabled={isPending}
        title={batch.bl_id ? `BL #${batch.bl_id}` : "Étiquettes"}
        className={cn(
          "w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
          "border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground",
          isPending && "opacity-50 cursor-not-allowed"
        )}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {msg && (
        <span className={`text-[10px] font-medium ${msg.ok ? "text-green-600" : "text-red-500"}`}>
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
  const [payment, setPayment] = useState("all");

  const q = search.toLowerCase().trim();

  const filtered = rows.filter((r) => {
    if (q) {
      const blStr = r.bl_id ? String(r.bl_id) : "";
      if (
        !blStr.includes(q) &&
        !r.batch_number.toLowerCase().includes(q) &&
        !(r.store_name ?? "").toLowerCase().includes(q)
      ) return false;
    }
    if (store   !== "all" && r.store_name !== store) return false;
    if (company !== "all" && (r.shipping_company ?? "Digylog") !== company) return false;
    if (payment !== "all" && (r.payment_status ?? "unpaid") !== payment) return false;
    return true;
  });

  const SEL = "h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Delivery Notes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {rows.length} groupe(s) au total
          </p>
        </div>
        <Link href="/admin/delivery/sheet-sync"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
          <Truck className="h-4 w-4" />
          Sync Sheet → Digylog
        </Link>
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search BL ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Store filter */}
          <select value={store} onChange={(e) => setStore(e.target.value)} className={SEL}>
            <option value="all">All Stores</option>
            {stores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Company filter */}
          <select value={company} onChange={(e) => setCompany(e.target.value)} className={SEL}>
            <option value="all">All Shipping Companies</option>
            {companies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Payment filter */}
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className={SEL}>
            <option value="all">All Payment Status</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed bg-card flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm font-medium text-muted-foreground">Aucun résultat</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["BL ID","SHIPPING","STORE","ORDERS","STATUS","PAYMENT","ACTIONS"].map((h) => (
                  <th key={h}
                    className="px-5 py-3.5 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((b) => {
                const sCfg = STATUS_CFG[b.status] ?? STATUS_CFG.draft;
                const pCfg = PAY_CFG[b.payment_status ?? "unpaid"] ?? PAY_CFG.unpaid;
                const SIcon = sCfg.icon;

                return (
                  <tr key={b.id}
                    className="hover:bg-secondary/20 transition-colors cursor-pointer group"
                    onClick={() => { window.location.href = `/admin/delivery/notes/${b.id}`; }}>

                    {/* BL ID */}
                    <td className="px-5 py-4">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {b.bl_id ?? b.batch_number}
                      </span>
                    </td>

                    {/* Shipping company */}
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 border border-violet-200 px-2.5 py-0.5 text-[11px] font-semibold">
                        {b.shipping_company ?? "Digylog"}
                      </span>
                    </td>

                    {/* Store */}
                    <td className="px-5 py-4 text-sm text-foreground font-medium">
                      {b.store_name ?? "—"}
                    </td>

                    {/* Orders count */}
                    <td className="px-5 py-4 text-sm font-bold text-foreground text-center">
                      {b.total_orders}
                    </td>

                    {/* Status badge */}
                    <td className="px-5 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide",
                        sCfg.cls
                      )}>
                        <SIcon className="h-3 w-3" />
                        {sCfg.label}
                      </span>
                    </td>

                    {/* Payment badge */}
                    <td className="px-5 py-4">
                      <span className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        pCfg.cls
                      )}>
                        {pCfg.label}
                      </span>
                    </td>

                    {/* Download action */}
                    <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                      <ActionBtn batch={b} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer */}
          <div className="border-t bg-secondary/10 px-5 py-3 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filtered.length} résultat(s) sur {rows.length}
            </p>
            <p className="text-xs text-muted-foreground">
              Total: {filtered.reduce((s, r) => s + r.total_orders, 0)} commandes
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
