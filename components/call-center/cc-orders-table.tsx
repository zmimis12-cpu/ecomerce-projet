"use client";
import { useState } from "react";
import Link from "next/link";
import { CallResultBadge } from "./call-result-badge";
import { StatusBadge } from "@/components/orders/status-badge";
import { AgentAssignment, BulkAssignToolbar } from "./agent-assignment";
import { cn } from "@/lib/utils";
import type { CallCenterOrder } from "@/types/call-center";
import type { OrderStatus } from "@/types/orders";
import { Phone, Search, UserCheck } from "lucide-react";

interface CCOrdersTableProps {
  orders: CallCenterOrder[];
  agents: { id: string; full_name: string }[];
  canManage: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CCOrdersTable({ orders, agents, canManage }: CCOrdersTableProps) {
  const [search, setSearch]       = useState("");
  const [agentFilter, setAgent]   = useState("");
  const [statusFilter, setStatus] = useState("");
  const [selected, setSelected]   = useState<string[]>([]);

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !search || [
      o.customer_name, o.customer_phone, o.order_number, o.first_product_name ?? ""
    ].some((v) => v.toLowerCase().includes(q));
    const matchAgent  = !agentFilter || o.assigned_to === agentFilter;
    const matchStatus = !statusFilter || o.call_status === statusFilter;
    return matchSearch && matchAgent && matchStatus;
  });

  function toggleSelect(id: string) {
    setSelected((s) => s.includes(id) ? s.filter((i) => i !== id) : [...s, id]);
  }
  function toggleAll() {
    setSelected(selected.length === filtered.length ? [] : filtered.map((o) => o.id));
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, téléphone, commande…"
            className="pl-8 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        {canManage && (
          <select value={agentFilter} onChange={(e) => setAgent(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none">
            <option value="">Tous les agents</option>
            <option value="__unassigned__">Non assignés</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none">
          <option value="">Tous résultats</option>
          {["confirmed","refused","no_answer","unreachable","callback_requested","wrong_number"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} commande{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Bulk assign toolbar */}
      {canManage && selected.length > 0 && (
        <BulkAssignToolbar selectedIds={selected} agents={agents} onComplete={() => setSelected([])} />
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-14">
          <Phone className="h-9 w-9 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium">Aucune commande</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {canManage && (
                    <th className="px-3 py-3">
                      <input type="checkbox"
                        checked={selected.length === filtered.length && filtered.length > 0}
                        onChange={toggleAll}
                        className="rounded border-input" />
                    </th>
                  )}
                  {["Commande","Client","Produit","Statut","Résultat appel","Agent","Appels","Dernier appel",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((order) => (
                  <tr key={order.id} className={cn("hover:bg-secondary/20 transition-colors", selected.includes(order.id) && "bg-primary/5")}>
                    {canManage && (
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={selected.includes(order.id)}
                          onChange={() => toggleSelect(order.id)} className="rounded border-input" />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium">{order.order_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm truncate max-w-[130px]">{order.customer_name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />{order.customer_phone}
                      </div>
                      <p className="text-xs text-muted-foreground">{order.customer_city}</p>
                    </td>
                    <td className="px-4 py-3">
                      {order.first_product_name ? (
                        <>
                          <p className="text-xs truncate max-w-[140px]">{order.first_product_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{order.first_product_sku}</p>
                        </>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status as OrderStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {order.call_status
                        ? <CallResultBadge result={order.call_status} />
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <AgentAssignment
                          orderId={order.id}
                          currentAgentId={order.assigned_to}
                          agents={agents}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{order.agent_name ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-mono">{order.call_attempts}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {order.last_call_at
                          ? new Date(order.last_call_at).toLocaleDateString("fr-MA")
                          : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/call-center/orders/${order.id}`}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
                        <UserCheck className="h-3.5 w-3.5" /> Appeler
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
