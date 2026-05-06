"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { syncSheetToDigylog } from "@/lib/delivery/sheet-sync/actions";
import type { SyncResult } from "@/lib/delivery/sheet-sync/actions";
import { RefreshCw, CheckCircle, XCircle, SkipForward, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CFG = {
  sent:    { label:"Envoyé",    icon:CheckCircle,  cls:"text-green-700", rowCls:"bg-green-50/30" },
  failed:  { label:"Échoué",   icon:XCircle,       cls:"text-red-600",   rowCls:"bg-red-50/30" },
  skipped: { label:"Ignoré",   icon:SkipForward,   cls:"text-gray-500",  rowCls:"" },
  invalid: { label:"Invalide", icon:AlertTriangle, cls:"text-amber-600", rowCls:"bg-amber-50/30" },
} as const;

export function SheetSyncClient({ sheetConfigured }: { sheetConfigured: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncSheetToDigylog();
      setResult(res);
    });
  }

  return (
    <div className="space-y-5">
      {/* Sync button */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold">Lancer la synchronisation</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Lit toutes les lignes du Sheet, envoie les nouvelles à Digylog, écrit le tracking en retour.
            </p>
          </div>
          <button type="button" onClick={handleSync}
            disabled={isPending || !sheetConfigured}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Synchronisation en cours…" : "Sync Google Sheet → Digylog"}
          </button>
        </div>

        {isPending && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
            Lecture du sheet, envoi à Digylog et écriture du tracking en cours…
            Ne fermez pas la page.
          </div>
        )}
      </div>

      {/* Error */}
      {result && !result.success && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-2">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900 text-sm">Erreur de synchronisation</p>
              <p className="text-xs text-red-700 mt-1 font-mono">{result.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success summary */}
      {result?.success && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Total lignes",  value:result.total,   cls:"" },
              { label:"Envoyés",       value:result.sent,    cls:"text-green-700" },
              { label:"Échoués",       value:result.failed,  cls:result.failed > 0 ? "text-red-600" : "" },
              { label:"Ignorés",       value:result.skipped, cls:"text-gray-500" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={cn("text-2xl font-bold", s.cls)}>{s.value}</p>
              </div>
            ))}
          </div>

          {result.batchId && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="font-semibold text-green-900 text-sm">
                    Groupe créé: {result.batchNumber}
                  </p>
                  <p className="text-xs text-green-700">
                    {result.sent} commande(s) — Tickets et BL disponibles dans Delivery Notes.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link href={`/admin/delivery/notes/${result.batchId}`}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                  Delivery Notes →
                </Link>
                <Link href="/admin/delivery/notes"
                  className="rounded-lg bg-green-100 text-green-800 px-3 py-1.5 text-xs font-semibold hover:bg-green-200">
                  Tous les BLs
                </Link>
              </div>
            </div>
          )}

          {/* Row results table */}
          {result.rows.length > 0 && (
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b font-medium text-sm">
                Détail par ligne ({result.rows.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-secondary/30">
                      {["Ligne","Référence","Client","SKU","Tracking","Statut","Erreur"].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.rows.map((row) => {
                      const cfg = STATUS_CFG[row.status];
                      const Icon = cfg.icon;
                      return (
                        <tr key={row.rowNumber} className={cn("hover:bg-secondary/20", cfg.rowCls)}>
                          <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.rowNumber}</td>
                          <td className="px-3 py-2.5 font-mono font-medium">{row.orderReference || "—"}</td>
                          <td className="px-3 py-2.5">{row.customerName || "—"}</td>
                          <td className="px-3 py-2.5 font-mono">{row.productSku || "—"}</td>
                          <td className="px-3 py-2.5">
                            {row.tracking
                              ? <span className="font-mono bg-secondary px-1.5 py-0.5 rounded">{row.tracking}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("flex items-center gap-1 font-semibold", cfg.cls)}>
                              <Icon className="h-3.5 w-3.5" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-red-600 max-w-[200px]">
                            {row.error ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
