"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Truck, Banknote } from "lucide-react";
import { generateSelfDeliveryTicket } from "@/lib/delivery/self-delivery-ticket";
import { markSelfDeliveryPaid } from "@/lib/orders/actions";

export function SelfDeliveryTicketButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isPaidPending, startPaidTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paidDone, setPaidDone] = useState(false);
  const router = useRouter();

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

  function handleMarkPaid() {
    startPaidTransition(async () => {
      const res = await markSelfDeliveryPaid(orderId);
      if (res.success) { setPaidDone(true); router.refresh(); }
    });
  }

  return (
    <div className="space-y-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80">
          <Truck className="h-3.5 w-3.5" /> Générer ticket livreur (hors Digylog)
        </button>
      ) : (
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
      )}

      {/* Marquer payée en espèces — livraison propre, pas de réconciliation
          Digylog nécessaire (le livreur remet l'argent directement). */}
      {paidDone ? (
        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
          <Banknote className="h-3.5 w-3.5" /> Marquée payée (espèce, livreur propre)
        </span>
      ) : (
        <button type="button" onClick={handleMarkPaid} disabled={isPaidPending}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 disabled:opacity-50">
          <Banknote className="h-3.5 w-3.5" /> {isPaidPending ? "…" : "Marquer payée (espèce, livreur propre)"}
        </button>
      )}
    </div>
  );
}
