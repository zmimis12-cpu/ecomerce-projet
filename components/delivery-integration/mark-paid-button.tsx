"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatus } from "@/lib/orders/actions";

export function MarkPaidButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  if (done) return <span className="text-xs text-emerald-600 font-medium">✓ Marquée payée</span>;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const res = await updateOrderStatus(orderId, "paid", "Marquée payée manuellement depuis la réconciliation (écart mineur accepté).");
          if (res.success) { setDone(true); router.refresh(); }
        });
      }}
      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
    >
      {isPending ? "…" : "Marquer payé"}
    </button>
  );
}
