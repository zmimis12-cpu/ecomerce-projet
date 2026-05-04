"use client";
import { useState, useTransition } from "react";
import { sendOrderToDigylog } from "@/lib/delivery/shipment-actions";
import { Send } from "lucide-react";

interface Props {
  orderId:  string;
  disabled?: boolean;
}

export function SendToDigylogButton({ orderId, disabled }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handle() {
    setResult(null);
    startTransition(async () => {
      const res = await sendOrderToDigylog(orderId);
      if (res.success) {
        setResult({ ok: true, msg: `✓ Envoyé — Tracking: ${res.tracking}${res.blId ? ` — BL: ${res.blId}` : ""}` });
      } else {
        setResult({ ok: false, msg: res.error ?? "Erreur" });
      }
    });
  }

  return (
    <div className="space-y-2">
      {result && (
        <p className={`text-xs font-medium ${result.ok ? "text-green-700" : "text-red-700"}`}>
          {result.msg}
        </p>
      )}
      <button type="button" onClick={handle}
        disabled={isPending || disabled}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
        <Send className="h-4 w-4" />
        {isPending ? "Envoi…" : "Envoyer à Digylog"}
      </button>
    </div>
  );
}
