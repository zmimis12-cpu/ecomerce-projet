"use client";
import { useState, useTransition } from "react";
import { triggerOrderSync } from "@/lib/automation/actions";
import type { SyncLogRow } from "@/lib/automation/queries";
import type { SheetType } from "@/lib/automation/google-sheets";
import { cn } from "@/lib/utils";
import { RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";

interface SyncLogTableProps { logs: SyncLogRow[]; }

const SHEET_TYPE_LABELS: Record<string, string> = {
  confirmed:     "Confirmées",
  delivered_paid:"Livrées payées",
  returned:      "Retours",
};

export function SyncLogTable({ logs }: SyncLogTableProps) {
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  function handleRetry(orderId: string, sheetType: string) {
    startTransition(async () => {
      const res = await triggerOrderSync(orderId, sheetType as SheetType);
      setToast(res.success ? "✓ Synchronisé avec succès." : `✕ ${res.error}`);
      setTimeout(() => setToast(null), 4000);
    });
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium",
          toast.startsWith("✓") ? "bg-green-600 text-white" : "bg-red-50 border border-red-200 text-red-700"
        )}>
          {toast}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="rounded-xl border bg-card flex flex-col items-center justify-center py-12">
          <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium">Aucun log de synchronisation</p>
          <p className="text-xs text-muted-foreground mt-1">Les syncs apparaîtront ici automatiquement.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/30">
                  {["Commande","Client","Feuille","Statut","Ligne","Date",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-medium">{log.order_number ?? log.order_id.slice(0,8)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {log.customer_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs bg-secondary rounded px-1.5 py-0.5">
                        {SHEET_TYPE_LABELS[log.sheet_type] ?? log.sheet_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {log.status === "success" ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Succès
                        </span>
                      ) : log.status === "failed" ? (
                        <div>
                          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                            <XCircle className="h-3.5 w-3.5" /> Échec
                          </span>
                          {log.error_message && (
                            <p className="text-xs text-red-500 mt-0.5 max-w-[200px] truncate" title={log.error_message}>
                              {log.error_message}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">En attente</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                      {log.sheet_row ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("fr-MA")}
                    </td>
                    <td className="px-4 py-2.5">
                      {log.status === "failed" && (
                        <button type="button"
                          onClick={() => handleRetry(log.order_id, log.sheet_type)}
                          disabled={isPending}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                          <RefreshCw className="h-3 w-3" /> Retry
                        </button>
                      )}
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
