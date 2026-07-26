"use client";

import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { generateSelfDeliveryTicket } from "@/lib/delivery/self-delivery-ticket";

export function SelfDeliveryTicketButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateSelfDeliveryTicket(orderId, Number(fee) || 0);
      if (!res.success || !res.base64) { setError(res.error ?? "Erreur inconnue."); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-livraison-${orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
        <Truck className="h-3.5 w-3.5" /> Générer ticket livreur (hors Digylog)
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-secondary/20 p-3 space-y-2">
      <label className="text-xs font-medium">أجرة التوصيل ديال السائق (اختياري)</label>
      <input type="number" value={fee} onChange={(e) => setFee(e.target.value)}
        placeholder="0" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
      <p className="text-[11px] text-muted-foreground">
        سيب فارغ إلا الليفور غادي يسلم المبلغ كامل. عمرها إلا كان عندو نصيب محدد.
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
          Annuler
        </button>
        <button type="button" onClick={handleGenerate} disabled={isPending}
          className="flex items-center gap-1.5 rounded-md bg-black text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50">
          <Truck className="h-3.5 w-3.5" /> {isPending ? "Génération…" : "Générer le ticket"}
        </button>
      </div>
    </div>
  );
}
