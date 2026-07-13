"use client";

import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { resendOrderConfirmationWhatsApp } from "@/lib/whatsapp/actions";

export function ResendWhatsAppButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sent: boolean; reason?: string; error?: string } | null>(null);

  function send() {
    setResult(null);
    startTransition(async () => {
      const res = await resendOrderConfirmationWhatsApp(orderId);
      setResult(res);
    });
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={send} disabled={isPending}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 px-3 py-1.5 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50">
        <MessageCircle className="h-3.5 w-3.5" />
        {isPending ? "Envoi..." : "Renvoyer confirmation WhatsApp"}
      </button>
      {result && (
        <p className={`text-xs rounded-md px-2 py-1.5 ${result.sent ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {result.sent
            ? (result.reason ? `✅ Envoyé — ${result.reason}` : "✅ Message + médias envoyés.")
            : `❌ ${result.reason ?? result.error ?? "Échec inconnu."}`}
        </p>
      )}
    </div>
  );
}
