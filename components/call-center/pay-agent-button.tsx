"use client";
import { useState, useTransition } from "react";
import { recordAgentPayment } from "@/lib/call-center/agent-queries";
import { Award, X, CheckCircle } from "lucide-react";

export function PayAgentButton({ agentId, agentName, remaining }: {
  agentId: string; agentName: string; remaining: number;
}) {
  const [open, setOpen]           = useState(false);
  const [amount, setAmount]       = useState(remaining.toFixed(2));
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState("");
  const [isPending, start]        = useTransition();
  const [msg, setMsg]             = useState<string | null>(null);

  function handlePay() {
    start(async () => {
      const res = await recordAgentPayment({
        agentId, periodStart, periodEnd,
        paidAmount: parseFloat(amount) || 0,
        notes: notes || undefined,
      });
      if (res.success) {
        setMsg("✓ Paiement enregistré.");
        setTimeout(() => { setOpen(false); setMsg(null); window.location.reload(); }, 1000);
      } else {
        setMsg(`✕ ${res.error}`);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700 transition-colors">
        <Award className="h-3.5 w-3.5" /> Payer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Payer {agentName}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Période début</label>
                  <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Période fin</label>
                  <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Montant payé (MAD) — Restant dû: {remaining.toFixed(2)} MAD
                </label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                  step="0.01" min="0"
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optionnel)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="ex: virement mars 2026"
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>

            {msg && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${msg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {msg.startsWith("✓") ? <CheckCircle className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {msg}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border py-2.5 text-sm font-medium hover:bg-secondary transition-colors">
                Annuler
              </button>
              <button type="button" onClick={handlePay} disabled={isPending}
                className="flex-1 rounded-xl bg-emerald-600 text-white py-2.5 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {isPending ? "Enregistrement…" : "Confirmer paiement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
