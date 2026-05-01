"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOrder } from "@/lib/orders/actions";

export function DeleteOrderButton({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    if (!confirm(`Supprimer la commande ${orderNumber} ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      await deleteOrder(orderId);
      router.push("/admin/orders");
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={handleDelete} disabled={isPending}
      className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
      <Trash2 className="h-3.5 w-3.5" />
      {isPending ? "Suppression…" : "Supprimer"}
    </button>
  );
}
