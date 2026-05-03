"use client";
import { useState, useTransition } from "react";
import { retryAllFailed } from "@/lib/automation/actions";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function RetryAllButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleRetry() {
    startTransition(async () => {
      const res = await retryAllFailed();
      setResult(`${res.succeeded}/${res.retried} synchronisé(s) avec succès.`);
      setTimeout(() => setResult(null), 5000);
    });
  }

  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-sm text-green-600 font-medium">✓ {result}</span>}
      <button type="button" onClick={handleRetry} disabled={isPending}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium",
          "hover:bg-secondary transition-colors disabled:opacity-50"
        )}>
        <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
        {isPending ? "Relance…" : "Relancer les échecs"}
      </button>
    </div>
  );
}
