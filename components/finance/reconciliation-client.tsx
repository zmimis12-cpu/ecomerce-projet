"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { triggerReconciliation, markResolved } from "@/lib/finance/reconciliation-actions";
import type { ReconciliationRow } from "@/lib/finance/reconciliation-engine";
import { AlertTriangle, CheckCircle2, RefreshCw, X, Search, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const ISSUE_LABELS: Record<string, { label: string; color: string }> = {
  delivered_not_paid:       { label: "Livré non payé",        color: "bg-red-100 text-red-700" },
  paid_but_not_delivered:   { label: "Payé non livré",        color: "bg-orange-100 text-orange-700" },
  casa_overcharged:         { label: "Casa surchargé",        color: "bg-amber-100 text-amber-700" },
  shipping_fee_mismatch:    { label: "Frais incorrects",      color: "bg-yellow-100 text-yellow-700" },
  missing_return:           { label: "Retour manquant",       color: "bg-purple-100 text-purple-700" },
  unknown_return:           { label: "Retour inconnu",        color: "bg-purple-100 text-purple-700" },
  missing_refund:           { label: "Remboursement manquant",color: "bg-blue-100 text-blue-700" },
  unknown_refund:           { label: "Remboursement inconnu", color: "bg-blue-100 text-blue-700" },
  damaged_return:           { label: "Retour endommagé",      color: "bg-red-100 text-red-700" },
  quantity_mismatch:        { label: "Quantité incorrecte",   color: "bg-orange-100 text-orange-700" },
  invoice_total_mismatch:   { label: "Total facture incorrect",color: "bg-red-100 text-red-700" },
};

function mad(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)} MAD`;
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", color)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold font-mono mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function ReconciliationClient({
  issues,
  total,
  summary,
}: {
  issues: ReconciliationRow[];
  total: number;
  summary: { total: number; totalDiff: number; overcharged: number; missingPayments: number; missingReturns: number; errors: number; warnings: number };
}) {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected]   = useState<ReconciliationRow | null>(null);
  const [resNote, setResNote]     = useState("");
  const [resolving, startResolve] = useTransition();
  const [running, startRun]       = useTransition();
  const [runResult, setRunResult] = useState<string | null>(null);

  const page    = Number(searchParams.get("page") ?? 0);
  const pages   = Math.ceil(total / 50);

  function updateFilter(key: string, val: string) {
    const p = new URLSearchParams(searchParams.toString());
    if (val) p.set(key, val); else p.delete(key);
    p.delete("page");
    router.push(`/admin/finance/reconciliation?${p.toString()}`);
  }

  function handleResolve() {
    if (!selected) return;
    startResolve(async () => {
      await markResolved(selected.id, resNote);
      setSelected(null);
      setResNote("");
      router.refresh();
    });
  }

  function handleRun() {
    setRunResult(null);
    startRun(async () => {
      const r = await triggerReconciliation({ providerSlug: "digylog" });
      if (r.success) {
        setRunResult(`✓ Sync terminé — ${r.synced} expéditions sync, ${r.issuesFound} anomalie(s) détectée(s)`);
      } else {
        setRunResult(`✕ Erreur: ${r.error}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Réconciliation Transporteur</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Détection automatique des anomalies financières et opérationnelles.
          </p>
        </div>
        <button type="button" onClick={handleRun} disabled={running}
          className="flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity">
          <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} />
          {running ? "Synchronisation…" : "Sync & Analyser"}
        </button>
      </div>

      {runResult && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm flex items-center gap-2",
          runResult.startsWith("✓") ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"
        )}>
          {runResult.startsWith("✓") ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {runResult}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <SummaryCard label="Anomalies actives"  value={summary.total}
          color={summary.total > 0 ? "border-red-200" : ""} />
        <SummaryCard label="Écart financier"    value={`${summary.totalDiff.toFixed(2)} MAD`}
          color={summary.totalDiff < 0 ? "border-red-200 bg-red-50/30" : ""} />
        <SummaryCard label="Casa surchargé"     value={summary.overcharged} />
        <SummaryCard label="Livrés non payés"   value={summary.missingPayments}
          color={summary.missingPayments > 0 ? "border-red-200" : ""} />
        <SummaryCard label="Retours manquants"  value={summary.missingReturns} />
        <SummaryCard label="Erreurs critiques"  value={summary.errors}
          color={summary.errors > 0 ? "border-red-200 bg-red-50/30" : ""} />
        <SummaryCard label="Avertissements"     value={summary.warnings}
          color={summary.warnings > 0 ? "border-amber-200 bg-amber-50/30" : ""} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            defaultValue={searchParams.get("q") ?? ""}
            onChange={(e) => updateFilter("q", e.target.value)}
            placeholder="Tracking, commande…"
            className="pl-9 h-9 w-48 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select defaultValue={searchParams.get("type") ?? ""}
          onChange={(e) => updateFilter("type", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none">
          <option value="">Tous types</option>
          {Object.entries(ISSUE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <input type="date" defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => updateFilter("from", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none" />
        <input type="date" defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => updateFilter("to", e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none" />
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/30">
                {["Tracking", "Commande", "Ville", "COD", "Frais att.", "Frais réels", "Écart", "Anomalie", "Sév.", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {issues.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  Aucune anomalie détectée. Cliquez &quot;Sync &amp; Analyser&quot; pour lancer la vérification.
                </td></tr>
              )}
              {issues.map((issue) => {
                const issueInfo = ISSUE_LABELS[issue.issue_type] ?? { label: issue.issue_type, color: "bg-gray-100 text-gray-600" };
                const diff = issue.difference ?? 0;
                return (
                  <tr key={issue.id} className={cn("hover:bg-secondary/20 transition-colors", issue.is_resolved && "opacity-50")}>
                    <td className="px-4 py-2.5 font-mono text-xs">{issue.tracking ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">{issue.order_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">{issue.city ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{issue.cod_amount != null ? `${issue.cod_amount} MAD` : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{issue.expected_fee != null ? `${issue.expected_fee} MAD` : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{issue.actual_fee != null ? `${issue.actual_fee} MAD` : "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs font-bold">
                      <span className={diff < 0 ? "text-red-600" : diff > 0 ? "text-green-600" : "text-muted-foreground"}>
                        {diff !== 0 ? mad(diff) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", issueInfo.color)}>
                        {issueInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
                        issue.severity === "error"   ? "bg-red-100 text-red-700" :
                        issue.severity === "warning" ? "bg-amber-100 text-amber-700" :
                                                       "bg-gray-100 text-gray-600"
                      )}>
                        {issue.severity === "error" ? "Critique" : issue.severity === "warning" ? "Attention" : "Info"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {!issue.is_resolved && (
                        <button type="button" onClick={() => setSelected(issue)}
                          className="text-xs text-primary hover:underline">
                          Résoudre
                        </button>
                      )}
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
            <span className="text-xs text-muted-foreground">Page {page + 1} / {pages} · {total} anomalies</span>
            <div className="flex gap-1">
              <a href={`?page=${page - 1}&${new URLSearchParams(Object.fromEntries(searchParams)).toString()}`}
                className={cn("h-7 w-7 rounded border flex items-center justify-center text-xs hover:bg-secondary transition-colors", page === 0 && "pointer-events-none opacity-30")}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </a>
              <a href={`?page=${page + 1}&${new URLSearchParams(Object.fromEntries(searchParams)).toString()}`}
                className={cn("h-7 w-7 rounded border flex items-center justify-center text-xs hover:bg-secondary transition-colors", page >= pages - 1 && "pointer-events-none opacity-30")}>
                <ChevronRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Resolve modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Résoudre l&apos;anomalie</p>
              <button type="button" onClick={() => setSelected(null)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="rounded-lg bg-secondary/30 px-3 py-2.5 text-xs">
              <p className="font-medium">{selected.tracking} · {selected.order_number}</p>
              <p className="text-muted-foreground mt-0.5">{selected.description}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Note de résolution</label>
              <textarea value={resNote} onChange={(e) => setResNote(e.target.value)}
                placeholder="ex: Frais corrigés par transporteur, remboursement reçu…" rows={3}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelected(null)}
                className="flex-1 rounded-xl border py-2.5 text-sm hover:bg-secondary transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handleResolve} disabled={resolving}
                className="flex-1 rounded-xl bg-green-600 text-white py-2.5 text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
                {resolving ? "Résolution…" : "Marquer résolu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
