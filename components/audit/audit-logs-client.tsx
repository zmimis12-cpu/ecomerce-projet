"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuditLogRow } from "@/lib/audit/audit-logger";
import { cn } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, X, Eye } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  CREATE:           "bg-green-100 text-green-700",
  UPDATE:           "bg-blue-100 text-blue-700",
  DELETE:           "bg-red-100 text-red-700",
  STATUS_CHANGE:    "bg-purple-100 text-purple-700",
  STOCK_MOVEMENT:   "bg-orange-100 text-orange-700",
  IMPORT:           "bg-cyan-100 text-cyan-700",
  SYNC:             "bg-indigo-100 text-indigo-700",
  SCAN:             "bg-amber-100 text-amber-700",
  DUPLICATE_BLOCKED:"bg-yellow-100 text-yellow-700",
  RECONCILE:        "bg-teal-100 text-teal-700",
  LOGIN:            "bg-gray-100 text-gray-600",
  FAILED_ACTION:    "bg-red-100 text-red-700",
};

export function AuditLogsClient({ logs, total }: { logs: AuditLogRow[]; total: number }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/admin/audit-logs?${params.toString()}`);
  }

  function setPage(delta: number) {
    const params = new URLSearchParams(searchParams.toString());
    const cur = Number(params.get("page") ?? 0);
    params.set("page", String(Math.max(0, cur + delta)));
    router.push(`/admin/audit-logs?${params.toString()}`);
  }

  const page    = Number(searchParams.get("page") ?? 0);
  const perPage = 50;
  const pages   = Math.ceil(total / perPage);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">{total.toLocaleString()} événements enregistrés.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            defaultValue={searchParams.get("q") ?? ""}
            onChange={(e) => updateFilter("q", e.target.value)}
            placeholder="Rechercher tracking, commande…"
            className="pl-9 h-9 w-56 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Action filter */}
        <select defaultValue={searchParams.get("action") ?? ""}
          onChange={(e) => updateFilter("action", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Toutes actions</option>
          {["CREATE","UPDATE","DELETE","STATUS_CHANGE","STOCK_MOVEMENT","IMPORT","SYNC","SCAN","DUPLICATE_BLOCKED","RECONCILE","LOGIN","FAILED_ACTION"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Entity filter */}
        <select defaultValue={searchParams.get("entity") ?? ""}
          onChange={(e) => updateFilter("entity", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Tous entités</option>
          {["order","stock","product","delivery_batch","digylog_document","scanner_event","finance_invoice","user","settings","return","webhook"].map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        {/* Module filter */}
        <select defaultValue={searchParams.get("module") ?? ""}
          onChange={(e) => updateFilter("module", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Tous modules</option>
          {["digylog_webhook","scanner","sheet-sync","digylog_documents","reconciliation","manual_sync","batch"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Date from/to */}
        <input type="date" defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateFilter("from", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        <input type="date" defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateFilter("to", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />

        {/* Clear filters */}
        {[...searchParams.entries()].filter(([k]) => k !== "page").length > 0 && (
          <button type="button" onClick={() => router.push("/admin/audit-logs")}
            className="h-9 flex items-center gap-1.5 rounded-lg border px-3 text-sm text-muted-foreground hover:bg-secondary transition-colors">
            <X className="h-3.5 w-3.5" /> Effacer
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Date", "Utilisateur", "Action", "Entité", "Label", "Champs modifiés", "Module", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground text-sm">Aucun log trouvé.</td></tr>
              )}
              {logs.map((log) => {
                const actionColor = ACTION_COLORS[log.action_type ?? log.action] ?? "bg-gray-100 text-gray-600";
                return (
                  <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("fr-MA", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="font-medium">{log.user_name_snapshot ?? "Système"}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", actionColor)}>
                        {log.action_type ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.entity_type ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono font-medium max-w-[160px] truncate">{log.entity_label ?? log.entity_id ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[160px] truncate">
                      {log.changed_fields?.join(", ") ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.source_module ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setSelected(log)}
                        className="p-1 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-secondary/10">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} / {pages} · {total.toLocaleString()} total
            </span>
            <div className="flex gap-1">
              <button type="button" onClick={() => setPage(-1)} disabled={page === 0}
                className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary disabled:opacity-40 transition-colors">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setPage(1)} disabled={page >= pages - 1}
                className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary disabled:opacity-40 transition-colors">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <p className="font-semibold">Détail Audit Log</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(selected.created_at).toLocaleString("fr-MA")} · {selected.source_module}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="rounded-lg border p-1.5 hover:bg-secondary transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Utilisateur", val: selected.user_name_snapshot ?? "Système" },
                  { label: "Action",      val: selected.action_type ?? selected.action },
                  { label: "Entité",      val: selected.entity_type ?? "—" },
                  { label: "Label",       val: selected.entity_label ?? selected.entity_id ?? "—" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-secondary/30 p-3">
                    <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                    <p className="text-sm font-semibold mt-0.5">{s.val}</p>
                  </div>
                ))}
              </div>

              {/* Changed fields */}
              {selected.changed_fields && selected.changed_fields.length > 0 && (
                <div className="rounded-lg bg-secondary/30 p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">Champs modifiés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.changed_fields.map((f) => (
                      <span key={f} className="inline-flex rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold">{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Old / New data */}
              <div className="grid grid-cols-2 gap-3">
                {selected.old_data && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 mb-1.5">Avant</p>
                    <pre className="text-xs bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-48">
                      {JSON.stringify(selected.old_data, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.new_data && (
                  <div>
                    <p className="text-xs font-semibold text-green-600 mb-1.5">Après</p>
                    <pre className="text-xs bg-green-50 border border-green-100 rounded-lg p-3 overflow-auto max-h-48">
                      {JSON.stringify(selected.new_data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
