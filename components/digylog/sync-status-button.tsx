"use client";
import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { syncDigylogStatuses } from "@/lib/delivery/digylog/document-service";

export function SyncStatusButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [isOk, setIsOk]     = useState(true);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      const res = await syncDigylogStatuses();
      if (res.success) {
        setIsOk(true);
        setResult(`✓ ${res.checked} vérifiés · ${res.updated} mis à jour · ${res.unchanged} inchangés · ${res.failed} échoués`);
      } else {
        setIsOk(false);
        setResult(`✕ ${res.error}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {result && (
        <div className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs ${isOk ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {isOk ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {result}
        </div>
      )}
      <button type="button" onClick={handleSync} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Sync…" : "Sync Statuts"}
      </button>
    </div>
  );
}
