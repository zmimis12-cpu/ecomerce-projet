"use client";
import { useState, useTransition } from "react";
import { syncDigylogStatus, getDigylogLabelUrl, getDigylogBlUrl } from "@/lib/delivery/shipment-actions";
import { RefreshCw, FileDown, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  tracking_number: string | null;
  external_order_id: string | null;
  external_status: string | null;
  internal_status: string | null;
  bl_id: number | null;
  last_synced_at: string | null;
  created_at: string;
  orders: {
    id: string; order_number: string; customer_name: string;
    customer_phone: string; customer_city: string;
    total_amount_mad: number; status: string;
    is_paid: boolean; delivery_external_status: string | null;
  } | null;
};

function downloadPdf(b64: string, name: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
  Object.assign(document.createElement("a"), { href:url, download:name }).click();
  URL.revokeObjectURL(url);
}

const STATUS_COLORS: Record<string, string> = {
  not_sent:         "bg-gray-100 text-gray-700",
  in_transit:       "bg-blue-100 text-blue-800",
  delivered:        "bg-green-100 text-green-800",
  paid:             "bg-emerald-100 text-emerald-800",
  returned:         "bg-red-100 text-red-800",
  refused_delivery: "bg-orange-100 text-orange-800",
  cancelled:        "bg-gray-100 text-gray-600",
  lost:             "bg-red-200 text-red-900",
  postponed:        "bg-amber-100 text-amber-800",
  unknown:          "bg-gray-100 text-gray-500",
};

function RowActions({ row }: { row: Row }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync() {
    if (!row.tracking_number) return;
    setMsg(null);
    startTransition(async () => {
      const r = await syncDigylogStatus(row.tracking_number!);
      setMsg(r.success ? `✓ ${r.internal ?? "synced"}` : `✕ ${r.error}`);
    });
  }

  function downloadLabel() {
    if (!row.tracking_number) return;
    startTransition(async () => {
      const r = await getDigylogLabelUrl([row.tracking_number!]);
      if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `ticket-${row.tracking_number}.pdf`);
      else setMsg(`✕ ${r.error ?? "Erreur ticket"}`);
    });
  }

  function downloadBl() {
    if (!row.bl_id) return;
    startTransition(async () => {
      const r = await getDigylogBlUrl(row.bl_id!);
      if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `bl-${row.bl_id}.pdf`);
      else setMsg(`✕ ${r.error ?? "Erreur BL"}`);
    });
  }

  return (
    <div className="flex flex-col gap-1 items-start min-w-[110px]">
      {msg && (
        <span className={`text-[10px] font-medium ${msg.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
          {msg}
        </span>
      )}
      <button type="button" onClick={sync} disabled={isPending || !row.tracking_number}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
        <RefreshCw className={`h-3 w-3 ${isPending ? "animate-spin" : ""}`} />
        Sync statut
      </button>
      {row.tracking_number && (
        <button type="button" onClick={downloadLabel} disabled={isPending}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-40">
          <FileDown className="h-3 w-3" />
          Ticket 10×10
        </button>
      )}
      {row.bl_id ? (
        <button type="button" onClick={downloadBl} disabled={isPending}
          className="flex items-center gap-1 text-[10px] text-violet-700 hover:underline disabled:opacity-40">
          <FileDown className="h-3 w-3" />
          BL #{row.bl_id}
        </button>
      ) : (
        <span className="text-[10px] text-muted-foreground/50">BL non disponible</span>
      )}
    </div>
  );
}

export function DigylogOrdersClient({
  rows, statusLabels,
}: {
  rows: Row[];
  statusLabels: Record<string, string>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [bulkMsg, setBulkMsg]   = useState<string | null>(null);

  const filtered = rows.filter((r) => {
    const q   = search.toLowerCase();
    const matchSearch = !q || [
      r.tracking_number ?? "", r.external_order_id ?? "",
      r.orders?.customer_name ?? "", r.orders?.order_number ?? "",
      r.orders?.customer_city ?? "",
    ].some((f) => f.toLowerCase().includes(q));
    const matchStatus = statusFilter === "all" || r.internal_status === statusFilter;
    return matchSearch && matchStatus;
  });

  function toggleAll() {
    setSelected((s) => s.length === filtered.length ? [] : filtered.map((r) => r.id));
  }

  function bulkDownloadLabels() {
    const trackings = filtered
      .filter((r) => selected.includes(r.id) && r.tracking_number)
      .map((r) => r.tracking_number!);
    if (!trackings.length) return;
    setBulkMsg(null);
    startTransition(async () => {
      const r = await getDigylogLabelUrl(trackings);
      if (r.ok && r.blobBase64) {
        const bin = atob(r.blobBase64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
        Object.assign(document.createElement("a"), { href:url, download:`tickets-bulk-${Date.now()}.pdf` }).click();
        URL.revokeObjectURL(url);
      } else {
        setBulkMsg(r.error ?? "Erreur téléchargement");
      }
    });
  }

  const statuses = [...new Set(rows.map((r) => r.internal_status ?? "unknown"))];

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center gap-3 text-muted-foreground">
        <CheckCircle className="h-10 w-10 opacity-20" />
        <p className="text-sm font-medium">Aucune commande envoyée à Digylog</p>
        <p className="text-xs">Les commandes confirmées apparaissent ici après envoi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher tracking, commande, client…"
          className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex flex-wrap gap-1">
          {["all", ...statuses].map((s) => (
            <button key={s} type="button"
              onClick={() => setStatusFilter(s)}
              className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}>
              {s === "all" ? "Tout" : (statusLabels[s] ?? s)}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium">{selected.length} sélectionné(s)</span>
          <button type="button" onClick={bulkDownloadLabels} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <FileDown className="h-3.5 w-3.5" />
            {isPending ? "…" : "Tickets 10×10 (groupés)"}
          </button>
          <button type="button" onClick={() => setSelected([])}
            className="text-xs text-muted-foreground hover:text-foreground">
            Désélectionner
          </button>
          {bulkMsg && <span className="text-xs text-red-600">{bulkMsg}</span>}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-secondary/30">
                <th className="w-8 px-3 py-3">
                  <input type="checkbox" className="rounded"
                    checked={selected.length === filtered.length && filtered.length > 0}
                    onChange={toggleAll} />
                </th>
                {["Commande","Client","Ville","Tracking","Statut Digylog","Statut interne","BL","Sync","Actions"].map((h) => (
                  <th key={h} className="text-left px-3 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-3">
                    <input type="checkbox" className="rounded"
                      checked={selected.includes(row.id)}
                      onChange={() => setSelected((s) => s.includes(row.id) ? s.filter((x) => x !== row.id) : [...s, row.id])} />
                  </td>
                  <td className="px-3 py-3 font-mono font-medium">
                    {row.orders?.order_number ?? row.external_order_id ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{row.orders?.customer_name ?? "—"}</p>
                    <p className="text-muted-foreground">{row.orders?.customer_phone ?? ""}</p>
                  </td>
                  <td className="px-3 py-3">{row.orders?.customer_city ?? "—"}</td>
                  <td className="px-3 py-3">
                    {row.tracking_number
                      ? <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{row.tracking_number}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-muted-foreground">{row.external_status ?? "—"}</span>
                  </td>
                  <td className="px-3 py-3">
                    {row.internal_status && (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        STATUS_COLORS[row.internal_status] ?? STATUS_COLORS.unknown)}>
                        {statusLabels[row.internal_status] ?? row.internal_status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {row.bl_id
                      ? <span className="text-violet-700 font-semibold">#{row.bl_id}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {row.last_synced_at
                      ? new Date(row.last_synced_at).toLocaleString("fr-MA", { dateStyle:"short", timeStyle:"short" })
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <RowActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} / {rows.length} expédition(s)</p>
    </div>
  );
}
