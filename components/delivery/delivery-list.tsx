"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { DeliveryStatusBadge } from "./delivery-status-badge";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, formatMAD } from "@/types/delivery";
import type { DeliveryOrder } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { Truck, Search, TrendingUp, TrendingDown, CheckCircle, FileDown, Send } from "lucide-react";
import { getDigylogLabelUrl, getDigylogBlUrl, sendOrderToDigylog } from "@/lib/delivery/shipment-actions";

interface DeliveryListProps { orders: DeliveryOrder[]; }

export function DeliveryList({ orders }: DeliveryListProps) {
  const [search, setSearch]   = useState("");
  const [statusF, setStatus]  = useState("all");
  const [paidF, setPaid]      = useState("all");
  const [dateFrom, setFrom]   = useState("");
  const [dateTo, setTo]       = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkMsg, setBulkMsg]   = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function downloadPdf(b64: string, name: string) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
    Object.assign(document.createElement("a"), { href:url, download:name }).click();
    URL.revokeObjectURL(url);
  }

  function toggleSel(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function bulkPrintLabels() {
    const trackings = filtered
      .filter((o) => selected.includes(o.id) && o.delivery_tracking_number)
      .map((o) => o.delivery_tracking_number!);
    if (!trackings.length) return;
    setBulkMsg([]);
    startTransition(async () => {
      const r = await getDigylogLabelUrl(trackings);
      if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `labels-bulk.pdf`);
      else setBulkMsg([r.error ?? "Erreur téléchargement"]);
    });
  }

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !search || [
      o.order_number, o.customer_name, o.customer_phone,
      o.delivery_tracking_number ?? "", o.first_product_name ?? "",
    ].some((v) => v.toLowerCase().includes(q));
    const matchStatus = statusF === "all" || o.delivery_status === statusF;
    const matchPaid   = paidF === "all" || (paidF === "paid" ? o.is_paid : !o.is_paid);
    const matchFrom   = !dateFrom || o.created_at >= dateFrom;
    const matchTo     = !dateTo   || o.created_at <= dateTo + "T23:59:59";
    return matchSearch && matchStatus && matchPaid && matchFrom && matchTo;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Commande, client, téléphone, tracking…"
            className="pl-8 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={statusF} onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none">
          <option value="all">Tous statuts</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={paidF} onChange={(e) => setPaid(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none">
          <option value="all">Payé / Non payé</option>
          <option value="paid">Payé</option>
          <option value="unpaid">Non payé</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none" />
        <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none" />
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16">
          <Truck className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">Aucune livraison trouvée</p>
          <p className="text-xs text-muted-foreground mt-1">
            {orders.length === 0
              ? "Envoyez des commandes confirmées en livraison."
              : "Essayez d'autres filtres."}
          </p>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Bulk actions bar */}
          {selected.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 mb-3">
              <span className="text-sm font-medium">{selected.length} sélectionné(s)</span>
              <button type="button" onClick={bulkPrintLabels} disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <FileDown className="h-3.5 w-3.5" />
                {isPending ? "…" : "Imprimer étiquettes (100x100)"}
              </button>
              <button type="button" onClick={() => setSelected([])}
                className="text-xs text-muted-foreground hover:text-foreground">Désélectionner</button>
            </div>
          )}
          {bulkMsg.length > 0 && bulkMsg.map((m,i) => (
            <p key={i} className="text-xs text-red-600 mb-2">{m}</p>
          ))}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["","Commande","Client","Produit","Tracking","Statut transporteur","Envoyé","Livré","Paiement","Profit réel","Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => {
                  const profit = o.real_profit_mad;
                  return (
                    <tr key={o.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-3">
                        <input type="checkbox" className="rounded"
                          checked={selected.includes(o.id)}
                          onChange={() => toggleSel(o.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium">{o.order_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium truncate max-w-[130px]">{o.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{o.customer_phone}</p>
                        <p className="text-xs text-muted-foreground">{o.customer_city}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs truncate max-w-[140px]">{o.first_product_name ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        {o.delivery_tracking_number
                          ? <div className="space-y-0.5">
                              <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{o.delivery_tracking_number}</span>
                              {(o as unknown as { delivery_external_status?: string }).delivery_external_status && (
                                <p className="text-[10px] text-muted-foreground">
                                  {(o as unknown as { delivery_external_status: string }).delivery_external_status}
                                </p>
                              )}
                            </div>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {o.delivery_status
                          ? <DeliveryStatusBadge status={o.delivery_status} />
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {o.sent_to_delivery_at
                          ? new Date(o.sent_to_delivery_at).toLocaleDateString("fr-MA")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {o.delivered_at
                          ? new Date(o.delivered_at).toLocaleDateString("fr-MA")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {o.is_paid ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                            <CheckCircle className="h-3 w-3" /> Payé
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Non payé</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {profit !== null ? (
                          <span className={cn(
                            "flex items-center gap-1 text-xs font-mono font-medium",
                            profit >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {profit >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />}
                            {formatMAD(profit)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <Link href={`/admin/delivery/${o.id}`}
                            className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap">
                            Détails →
                          </Link>
                          {o.delivery_tracking_number && (
                            <button type="button"
                              onClick={() => {
                                startTransition(async () => {
                                  const r = await getDigylogLabelUrl([o.delivery_tracking_number!]);
                                  if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `label-${o.delivery_tracking_number}.pdf`);
                                });
                              }}
                              disabled={isPending}
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50">
                              <FileDown className="h-3 w-3" /> Étiquette
                            </button>
                          )}
                          {(o as unknown as { bl_id?: number }).bl_id && (
                            <button type="button"
                              onClick={() => {
                                const blId = (o as unknown as { bl_id: number }).bl_id;
                                startTransition(async () => {
                                  const r = await getDigylogBlUrl(blId);
                                  if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `bl-${blId}.pdf`);
                                });
                              }}
                              disabled={isPending}
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50">
                              <FileDown className="h-3 w-3" /> BL
                            </button>
                          )}
                        </div>
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
