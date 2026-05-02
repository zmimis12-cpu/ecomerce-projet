"use client";
import { useState } from "react";
import Link from "next/link";
import { DeliveryStatusBadge } from "./delivery-status-badge";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, formatMAD } from "@/types/delivery";
import type { DeliveryOrder } from "@/types/delivery";
import { cn } from "@/lib/utils";
import { Truck, Search, TrendingUp, TrendingDown, CheckCircle } from "lucide-react";

interface DeliveryListProps { orders: DeliveryOrder[]; }

export function DeliveryList({ orders }: DeliveryListProps) {
  const [search, setSearch]   = useState("");
  const [statusF, setStatus]  = useState("all");
  const [paidF, setPaid]      = useState("all");
  const [dateFrom, setFrom]   = useState("");
  const [dateTo, setTo]       = useState("");

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Commande","Client","Produit","Tracking","Statut livraison","Envoyé","Livré","Paiement","Profit réel",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => {
                  const profit = o.real_profit_mad;
                  return (
                    <tr key={o.id} className="hover:bg-secondary/20 transition-colors">
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
                          ? <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">{o.delivery_tracking_number}</span>
                          : <span className="text-xs text-muted-foreground">—</span>}
                        {o.delivery_company && (
                          <p className="text-xs text-muted-foreground mt-0.5">{o.delivery_company}</p>
                        )}
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
                        <Link href={`/admin/delivery/${o.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
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
