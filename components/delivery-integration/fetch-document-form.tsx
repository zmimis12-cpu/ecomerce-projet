"use client";
import { useState, useTransition } from "react";
import { fetchDeliveryDocument } from "@/lib/delivery/shipment-actions";
import { FileDown } from "lucide-react";

export function FetchDocumentForm() {
  const [isPending, startTransition] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"delivery"|"pickup"|"return">("delivery");
  const [result, setResult] = useState<string | null>(null);

  function handle() {
    setResult(null);
    startTransition(async () => {
      const res = await fetchDeliveryDocument(type, date);
      if (res.success) {
        setResult(res.fileUrl ? `✓ Document prêt: ${res.fileUrl}` : "✓ Demande envoyée");
      } else {
        setResult(`✕ ${res.error}`);
      }
    });
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold">Télécharger un bon</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="delivery">Bon de Livraison</option>
            <option value="pickup">Bon de Ramassage</option>
            <option value="return">Bon de Retour</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex items-end">
          <button type="button" onClick={handle} disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 w-full justify-center">
            <FileDown className="h-4 w-4" />
            {isPending ? "Chargement…" : "Télécharger"}
          </button>
        </div>
      </div>
      {result && (
        <p className="text-sm text-muted-foreground break-all">{result}</p>
      )}
    </div>
  );
}
