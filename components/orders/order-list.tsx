"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { formatOrderDate } from "@/types/orders";
import { ORDER_STATUSES, STATUS_LABELS } from "@/types/orders";
import type { OrderListItem, OrderStatus } from "@/types/orders";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Plus, Edit2, Phone, MapPin,
  TrendingUp, TrendingDown, Search, Filter
} from "lucide-react";

interface OrderListProps {
  orders: OrderListItem[];
  canManage: boolean;
}

export function OrderList({ orders, canManage }: OrderListProps) {
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState<OrderStatus | "all">("all");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");

  const filtered = orders.filter((o) => {
    const matchSearch = !search || [
      o.customer_name, o.customer_phone, o.order_number,
      o.first_product_name ?? "", o.first_product_sku ?? "",
    ].some((v) => v.toLowerCase().includes(search.toLowerCase()));

    const matchStatus = statusFilter === "all" || o.status === statusFilter;

    const matchFrom = !dateFrom || o.created_at >= dateFrom;
    const matchTo   = !dateTo   || o.created_at <= dateTo + "T23:59:59";

    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  // KPI summary
  const totalRevenue = filtered.reduce((s, o) => s + (o.total_amount_mad ?? 0), 0);
  const totalProfit  = filtered.reduce((s, o) => s + (o.estimated_profit ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Commandes"       value={String(filtered.length)} />
        <KpiCard label="CA estimé (MAD)" value={totalRevenue.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} />
        <KpiCard label="Profit estimé"   value={totalProfit.toLocaleString("fr-MA", { minimumFractionDigits: 2 })}
          className={totalProfit >= 0 ? "text-green-600" : "text-red-600"} />
        <KpiCard label="Taux confirmation"
          value={`${filtered.length === 0 ? 0 : Math.round(filtered.filter(o => o.status === "confirmed" || o.status === "sent_to_delivery" || o.status === "delivered" || o.status === "paid").length / filtered.length * 100)}%`} />
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, téléphone, commande…"
            className="pl-8 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatus(e.target.value as OrderStatus | "all")}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">Tous les statuts</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Date filters */}
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
        </span>

        {canManage && (
          <Link href="/admin/orders/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">
            <Plus className="h-4 w-4" /> Nouvelle commande
          </Link>
        )}
      </div>

      {/* Empty */}
      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-16 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="font-medium text-sm">Aucune commande trouvée</p>
          <p className="text-xs text-muted-foreground mt-1">
            {orders.length === 0 ? "Créez votre première commande." : "Essayez d'autres filtres."}
          </p>
          {orders.length === 0 && canManage && (
            <Link href="/admin/orders/new"
              className="mt-4 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Créer une commande
            </Link>
          )}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {[
                    { label: "Commande",  className: "text-left" },
                    { label: "Client",    className: "text-left" },
                    { label: "Produit",   className: "text-left" },
                    { label: "Montant",   className: "text-right" },
                    { label: "Profit",    className: "text-right" },
                    { label: "Statut",    className: "text-center" },
                    { label: "Agent",     className: "text-left" },
                    { label: "Date",      className: "text-left" },
                    { label: "",          className: "" },
                  ].map(({ label, className }) => (
                    <th key={label} className={cn(
                      "px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide",
                      className
                    )}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => {
                  const profit = order.estimated_profit ?? 0;
                  return (
                    <tr key={order.id} className="hover:bg-secondary/20 transition-colors">

                      {/* Order number */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {order.order_number}
                        </span>
                        {order.source && (
                          <p className="text-xs text-muted-foreground mt-0.5">{order.source}</p>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-sm truncate max-w-[140px]">{order.customer_name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Phone className="h-3 w-3" />
                          {order.customer_phone}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {order.customer_city}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="px-4 py-3">
                        {order.first_product_name ? (
                          <>
                            <p className="text-sm truncate max-w-[160px]">{order.first_product_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{order.first_product_sku}</p>
                            {order.item_count > 1 && (
                              <p className="text-xs text-muted-foreground">+{order.item_count - 1} article(s)</p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right font-mono font-medium text-sm">
                        {(order.total_amount_mad ?? 0).toLocaleString("fr-MA", { minimumFractionDigits: 2 })} MAD
                      </td>

                      {/* Profit */}
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "flex items-center justify-end gap-1 text-xs font-mono",
                          profit >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {profit.toLocaleString("fr-MA", { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={order.status} />
                      </td>

                      {/* Agent */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {order.agent_name ?? "—"}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatOrderDate(order.created_at)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${order.id}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                          Voir
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

function KpiCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold font-mono", className ?? "text-foreground")}>{value}</p>
    </div>
  );
}
