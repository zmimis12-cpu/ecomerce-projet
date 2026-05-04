"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { OrderListItem as Order, OrderStatus } from "@/types/orders";
import { StatusBadge } from "./status-badge";
import { sendOrderToDigylog, getDigylogLabelUrl } from "@/lib/delivery/shipment-actions";
import { Send, FileDown, RefreshCw, Package } from "lucide-react";

interface OrderListProps {
  orders:     Order[];
  canManage:  boolean;
}

// ── Mini stat card ─────────────────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

// ── Single row actions ─────────────────────────────────────────────────────────
function RowActions({ order, canManage }: { order: Order; canManage: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function downloadPdf(b64: string, name: string) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([buf], { type:"application/pdf" }));
    Object.assign(document.createElement("a"), { href:url, download:name }).click();
    URL.revokeObjectURL(url);
  }

  const canSend  = canManage && order.status === "confirmed" && !order.delivery_tracking_number;
  const hasTrack = !!order.delivery_tracking_number;

  return (
    <div className="flex flex-col gap-1 items-end">
      {/* Send to Digylog */}
      {canSend && (
        <button type="button" disabled={isPending}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const r = await sendOrderToDigylog(order.id);
              setMsg(r.success ? `✓ ${r.tracking}` : `✕ ${r.error}`);
            });
          }}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
          <Send className="h-3 w-3" />
          {isPending ? "…" : "Digylog"}
        </button>
      )}

      {/* Download label */}
      {hasTrack && (
        <button type="button" disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const r = await getDigylogLabelUrl([order.delivery_tracking_number!]);
              if (r.ok && r.blobBase64) downloadPdf(r.blobBase64, `label-${order.delivery_tracking_number}.pdf`);
              else setMsg(r.error ?? "Erreur");
            });
          }}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50">
          <FileDown className="h-3 w-3" />
          Étiquette
        </button>
      )}

      {msg && (
        <span className={`text-[10px] ${msg.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
          {msg}
        </span>
      )}
    </div>
  );
}

// ── Bulk Digylog send ──────────────────────────────────────────────────────────
function BulkDigylogBar({ selected, orders, onDone }: {
  selected: string[];
  orders:   Order[];
  onDone:   () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<string[]>([]);

  const eligible = orders.filter(
    (o) => selected.includes(o.id) && o.status === "confirmed" && !o.delivery_tracking_number
  );

  if (!selected.length) return null;

  function handleBulk() {
    setResults([]);
    startTransition(async () => {
      const msgs: string[] = [];
      for (const ord of eligible) {
        const r = await sendOrderToDigylog(ord.id);
        msgs.push(r.success
          ? `✓ ${ord.order_number} → ${r.tracking}`
          : `✕ ${ord.order_number}: ${r.error}`);
      }
      setResults(msgs);
      onDone();
    });
  }

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">
          {selected.length} sélectionné(s) — {eligible.length} envoyable(s) à Digylog
        </span>
        {eligible.length > 0 && (
          <button type="button" onClick={handleBulk} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Send className="h-3.5 w-3.5" />
            {isPending ? "Envoi en cours…" : `Envoyer ${eligible.length} à Digylog`}
          </button>
        )}
      </div>
      {results.length > 0 && (
        <div className="space-y-0.5">
          {results.map((r, i) => (
            <p key={i} className={`text-xs font-mono ${r.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
              {r}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: OrderStatus | "all"; label: string }[] = [
  { value:"all",                label:"Tout" },
  { value:"new",                label:"Nouveau" },
  { value:"confirmed",          label:"Confirmé" },
  { value:"sent_to_delivery",   label:"Expédié" },
  { value:"in_transit",         label:"En transit" },
  { value:"delivered",          label:"Livré" },
  { value:"paid",               label:"Payé" },
  { value:"returned",           label:"Retourné" },
  { value:"refused",            label:"Refusé" },
  { value:"no_answer",          label:"Sans réponse" },
  { value:"cancelled",          label:"Annulé" },
];

export function OrderList({ orders, canManage }: OrderListProps) {
  const [statusFilter, setStatus]   = useState<OrderStatus | "all">("all");
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<string[]>([]);
  const [selectionKey, setSelKey]   = useState(0); // force re-render after bulk

  const q = search.toLowerCase();
  const filtered = orders.filter((o) => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchSearch = !q || [
      o.order_number, o.customer_name, o.customer_phone,
      o.customer_city, o.delivery_tracking_number ?? "",
    ].some((f) => f.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const total = filtered.length;
  const conf  = filtered.filter((o) => ["confirmed","sent_to_delivery","in_transit","delivered","paid"].includes(o.status)).length;
  const deliv = filtered.filter((o) => ["delivered","paid"].includes(o.status)).length;
  const retur = filtered.filter((o) => o.status === "returned").length;
  const confRate  = total > 0 ? Math.round(conf / total * 100) : 0;
  const delivRate = conf  > 0 ? Math.round(deliv / conf * 100) : 0;

  function toggleSelect(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected((s) => s.length === filtered.length ? [] : filtered.map((o) => o.id));
  }

  const HEADERS = canManage
    ? ["","#","Client","Ville","Produit","Statut","Tracking","Total","Actions"]
    : ["#","Client","Ville","Produit","Statut","Tracking","Total"];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Leads"         value={total} />
        <Stat label="Confirmés"     value={`${conf} (${confRate}%)`}  color="text-blue-700" />
        <Stat label="Livrés"        value={`${deliv} (${delivRate}%)`} color="text-green-700" />
        <Stat label="Retours"       value={retur} color={retur > 0 ? "text-red-600" : undefined} />
        <Stat label="Tx confirmation" value={`${confRate}%`} color={confRate >= 50 ? "text-green-700" : "text-amber-600"} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher commande, client, téléphone, tracking…"
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex flex-wrap gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => setStatus(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        {canManage && (
          <Link href="/admin/orders/new"
            className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            + Nouvelle commande
          </Link>
        )}
      </div>

      {/* Bulk action bar */}
      {canManage && (
        <BulkDigylogBar
          key={selectionKey}
          selected={selected}
          orders={orders}
          onDone={() => { setSelected([]); setSelKey((k) => k + 1); }}
        />
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Package className="h-10 w-10 opacity-20" />
            <p className="text-sm">Aucune commande</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {canManage && (
                    <th className="w-8 px-3 py-3">
                      <input type="checkbox"
                        checked={selected.length === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="rounded" />
                    </th>
                  )}
                  {HEADERS.filter((h) => h !== "").map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-secondary/20 transition-colors">
                    {canManage && (
                      <td className="px-3 py-3">
                        <input type="checkbox"
                          checked={selected.includes(order.id)}
                          onChange={() => toggleSelect(order.id)}
                          className="rounded" />
                      </td>
                    )}
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Link href={`/admin/orders/${order.id}`} className="hover:text-primary">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs">{order.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{order.customer_phone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{order.customer_city}</td>
                    <td className="px-4 py-3 text-xs max-w-[140px] truncate">
                      {order.first_product_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3">
                      {order.delivery_tracking_number ? (
                        <div className="space-y-0.5">
                          <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
                            {order.delivery_tracking_number}
                          </span>
                          {order.delivery_external_status && (
                            <p className="text-[10px] text-muted-foreground">
                              {order.delivery_external_status}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      {order.total_amount_mad.toFixed(0)} MAD
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <RowActions order={order} canManage={canManage} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} commande(s) affichée(s)</p>
    </div>
  );
}
