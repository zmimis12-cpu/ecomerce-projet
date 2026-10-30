"use client";
import { useState, useTransition } from "react";
import { updateCcQuantity } from "@/lib/call-center/actions";

/** Quantité modifiable par la confirmatrice — le prix suit automatiquement (table calculée côté serveur). */
export function CcQtyEdit({ orderId, itemId, qty, prices, locked }: {
  orderId: string; itemId: string; qty: number; prices: Record<number, number>; locked: boolean;
}) {
  const [q, setQ] = useState(qty);
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const max = Math.max(5, qty);
  const price = prices[q] ?? (prices[1] ?? 0) * q;
  const btn = "h-9 w-9 rounded-lg border text-lg font-bold disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!locked && <button type="button" className={btn} disabled={pending || q <= 1} onClick={() => setQ(q - 1)}>−</button>}
      <span className="min-w-8 text-center text-lg font-bold">{q}</span>
      {!locked && <button type="button" className={btn} disabled={pending || q >= max} onClick={() => setQ(q + 1)}>+</button>}
      <span className="text-lg font-bold text-green-700" dir="ltr">{price} DH</span>
      {!locked && q !== qty && (
        <button type="button" disabled={pending}
          onClick={() => run(async () => {
            const r = await updateCcQuantity(orderId, itemId, q);
            setMsg(r.ok ? "✓ Enregistré" : `✕ ${r.error}`);
            if (r.ok) setTimeout(() => window.location.reload(), 500);
          })}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
      )}
      {msg && <span className="text-xs">{msg}</span>}
    </div>
  );
}
