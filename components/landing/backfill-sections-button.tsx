"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { backfillSectionsOnAllLandingPages } from "@/lib/landing-pages/actions";

export function BackfillSectionsButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ updated: number; failed: number } | null>(null);
  const router = useRouter();

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await backfillSectionsOnAllLandingPages();
      if (res.success) setResult({ updated: res.updated, failed: res.failed });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Mise à jour..." : "Ajouter les nouvelles sections (toutes les LP)"}
      </button>
      {result && (
        <p className="text-xs text-muted-foreground">
          {result.updated} mise(s) à jour{result.failed > 0 ? `, ${result.failed} échec(s)` : ""}
        </p>
      )}
    </div>
  );
}
