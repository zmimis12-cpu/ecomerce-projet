"use client";

import { useState, useTransition } from "react";
import { Truck } from "lucide-react";
import { generateSelfDeliveryTicket } from "@/lib/delivery/self-delivery-ticket";

export function SelfDeliveryTicketButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await generateSelfDeliveryTicket(orderId);
      if (!res.success || !res.base64) { setError(res.error ?? "Erreur inconnue."); return; }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-livraison-${orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={handleClick} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80 disabled:opacity-50">
        <Truck className="h-3.5 w-3.5" /> {isPending ? "Génération…" : "Générer ticket livreur (hors Digylog)"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
