"use client";
import { useState, useTransition } from "react";
import { reconcileInvoice } from "@/lib/delivery/shipment-actions";
import { RefreshCw } from "lucide-react";

export function ReconcileButton({ invoiceId }: { invoiceId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handle() {
    setResult(null);
    startTransition(async () => {
      const res = await reconcileInvoice(invoiceId);
      if (res.success) {
        setResult(`✓ ${res.matched} OK · ${res.missing} manquants · écart: ${res.diff?.toFixed(2)} MAD`);
      } else {
        setResult(`✕ ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
      <button type="button" onClick={handle} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Réconciliation…" : "Réconcilier"}
      </button>
    </div>
  );
}
