"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { exportCashPaidFormat } from "@/lib/delivery/export-cash-paid";

export function ExportCashPaidButton() {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo]     = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const res = await exportCashPaidFormat(from, to);
      if (!res.success || !res.base64) { setError(res.error ?? "Erreur inconnue."); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cash-paid-export-${from}-${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80">
        <Download className="h-4 w-4" /> Exporter (format Cash Paid Digylog)
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Exporter au format Cash Paid</h3>
        <p className="text-xs text-muted-foreground">
          Génère un fichier dans le même format que le rapport &quot;Cash Paid&quot; de Digylog, à partir de tes vraies commandes payées.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Du
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
          <label className="text-xs">
            Au
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
          </label>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setOpen(false)}
            className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
            Annuler
          </button>
          <button type="button" onClick={handleExport} disabled={isPending}
            className="flex items-center gap-1.5 rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> {isPending ? "Génération…" : "Exporter"}
          </button>
        </div>
      </div>
    </div>
  );
}
