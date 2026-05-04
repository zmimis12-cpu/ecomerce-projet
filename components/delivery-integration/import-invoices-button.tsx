"use client";
import { useState, useTransition } from "react";
import { importInvoices } from "@/lib/delivery/shipment-actions";
import { Download } from "lucide-react";

export function ImportInvoicesButton() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Default: last 30 days
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

  function handleImport() {
    setMsg(null);
    startTransition(async () => {
      const res = await importInvoices(from, to);
      if (res.success) {
        setMsg(`✓ ${res.imported ?? 0} facture(s) importée(s).`);
      } else {
        setMsg(`✕ ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      <button type="button" onClick={handleImport} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <Download className="h-4 w-4" />
        {isPending ? "Import…" : "Importer les factures"}
      </button>
    </div>
  );
}
