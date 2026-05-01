"use client";

import { useState, useTransition } from "react";
import { updateOrderStatus } from "@/lib/orders/actions";
import { StatusBadge } from "./status-badge";
import { ORDER_STATUSES, STATUS_LABELS, AGENT_ALLOWED_STATUSES } from "@/types/orders";
import type { OrderStatus } from "@/types/orders";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface StatusUpdaterProps {
  orderId: string;
  currentStatus: OrderStatus;
  isAgent: boolean;
}

export function StatusUpdater({ orderId, currentStatus, isAgent }: StatusUpdaterProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = isAgent
    ? AGENT_ALLOWED_STATUSES.filter((s) => s !== status)
    : ORDER_STATUSES.filter((s) => s !== status);

  function handleUpdate(newStatus: OrderStatus) {
    startTransition(async () => {
      const result = await updateOrderStatus(orderId, newStatus, note || undefined);
      if (result.success) {
        setStatus(newStatus);
        setNote("");
        setOpen(false);
        setToast(`Statut mis à jour : ${STATUS_LABELS[newStatus]}`);
        setTimeout(() => setToast(null), 3000);
      } else {
        setError(result.error ?? "Erreur.");
        setTimeout(() => setError(null), 5000);
      }
    });
  }

  return (
    <div className="space-y-3">
      {toast && <div className="rounded-lg bg-green-600 text-white text-xs px-3 py-2 font-medium">✓ {toast}</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">{error}</div>}

      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <button type="button" onClick={() => setOpen(!open)} disabled={isPending}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
          Changer <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 rounded-lg border bg-secondary/20 p-3">
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optionnel)…" rows={2}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />

          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button key={s} type="button" onClick={() => handleUpdate(s)} disabled={isPending}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50",
                  "hover:bg-primary hover:text-primary-foreground hover:border-primary"
                )}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
