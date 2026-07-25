"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, RotateCcw } from "lucide-react";
import { importBonRetour } from "@/lib/orders/actions";

export function ImportBonRetourButton() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ matched: number; notFound: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleImport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importBonRetour(raw);
      if (!res.success) { setError(res.error ?? "Erreur inconnue."); return; }
      setResult({ matched: res.matched, notFound: res.notFound });
      setRaw("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80">
        <RotateCcw className="h-4 w-4" /> Importer Bon Retour
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">Importer un Bon Retour Digylog</h3>
        <p className="text-xs text-muted-foreground">
          Ouvre le PDF du Bon Retour → sélectionne tout le texte du tableau (Ctrl+A puis Ctrl+C sur le contenu du PDF) → colle-le ici. Les commandes correspondantes seront marquées &quot;Retournée&quot; automatiquement.
        </p>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8}
          placeholder="HC-01255  SF2CF10BT  Temara  HajtekZone&#10;HC-01276  S711138FC  Casablanca  HajtekZone..."
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono" dir="ltr" />
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">{error}</p>}
        {result && (
          <div className="text-xs bg-emerald-50 text-emerald-700 rounded-md px-2 py-1.5">
            ✓ {result.matched} commande(s) marquée(s) &quot;Retournée&quot;.
            {result.notFound.length > 0 && (
              <p className="mt-1 text-amber-700">
                {result.notFound.length} tracking non trouvé(s) dans le système : {result.notFound.join(", ")}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => { setOpen(false); setError(null); setResult(null); }}
            className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
            Fermer
          </button>
          <button type="button" onClick={handleImport} disabled={!raw.trim() || isPending}
            className="flex items-center gap-1.5 rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> {isPending ? "Import…" : "Importer"}
          </button>
        </div>
      </div>
    </div>
  );
}
