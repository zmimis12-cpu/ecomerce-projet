"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { blockOrderCustomer, unblockPhone } from "@/lib/orders/blocklist-actions";

export function BlockCustomerButton({ orderId, phone, blocked }: { orderId: string; phone: string; blocked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    if (!blocked && !confirm(`Bloquer ${phone} ? Ses prochaines commandes ne seront plus enregistrées (et ne compteront pas dans Meta).`)) return;
    startTransition(async () => {
      if (blocked) await unblockPhone(phone); else await blockOrderCustomer(orderId);
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={isPending}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${blocked ? "bg-red-600 text-white hover:bg-red-700" : "text-red-600 hover:bg-red-50"}`}>
      <Ban className="h-3.5 w-3.5" />
      {isPending ? "…" : blocked ? "Bloqué — débloquer" : "Bloquer ce client"}
    </button>
  );
}
