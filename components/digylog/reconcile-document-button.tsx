"use client";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { reconcileDigylogDocument } from "@/lib/delivery/digylog/document-service";

export function ReconcileDocumentButton({ documentId }: { documentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleReconcile() {
    setResult(null);
    startTransition(async () => {
      const res = await reconcileDigylogDocument(documentId);
      if (res.success) {
        const parts = [`✓ ${res.matched} OK`];
        if ((res.mismatched ?? 0) > 0)    parts.push(`${res.mismatched} écarts`);
        if ((res.feeOvercharge ?? 0) > 0)  parts.push(`surcharge ${res.feeOvercharge?.toFixed(2)} MAD`);
        if ((res.codMismatch ?? 0) > 0)    parts.push(`${res.codMismatch} COD ≠`);
        if ((res.missing ?? 0) > 0)        parts.push(`${res.missing} manquants`);
        setResult(parts.join(" · "));
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setResult(`✕ ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {result && <span className="text-sm text-muted-foreground">{result}</span>}
      <button type="button" onClick={handleReconcile} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Réconciliation…" : "Réconcilier"}
      </button>
    </div>
  );
}
