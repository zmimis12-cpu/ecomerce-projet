"use client";
import { useState, useTransition } from "react";
import { recordAgentPaymentForm } from "@/lib/call-center/agent-queries";
import { AGENT_PAY_METHODS } from "@/lib/call-center/agent-payment-meta";
import { Award, X, CheckCircle } from "lucide-react";

export function PayAgentButton({ agentId, agentName, remaining }: {
  agentId: string; agentName: string; remaining: number;
}) {
  const [open, setOpen]           = useState(false);
  const [amount, setAmount]       = useState(remaining.toFixed(2));
  const [periodStart, setPeriodStart] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes]         = useState("");
  const [method, setMethod]       = useState("");
  const [ref, setRef]             = useState("");
  const [proof, setProof]         = useState<File | null>(null);
  const [isPending, start]        = useTransition();
  const [msg, setMsg]             = useState<string | null>(null);

  function handlePay() {
    if (!method) { setMsg("✕ Choisis le mode de paiement."); return; }
    start(async () => {
      const fd = new FormData();
      fd.set("agentId", agentId); fd.set("periodStart", periodStart); fd.set("periodEnd", periodEnd);
      fd.set("paidAmount", String(parseFloat(amount) || 0)); fd.set("method", method);
      fd.set("ref", ref); fd.set("notes", notes);
      if (proof) fd.set("proof", proof);
      const res = await recordAgentPaymentForm(fd);
      if (res.success && res.id) {
        setMsg("✓ Paiement enregistré.");
        window.open(`/admin/call-center/payments/${res.id}/recu`, "_blank");
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
          <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4 max-h-[92vh] overflow-y-auto">
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
                <label className="text-xs text-muted-foreground block mb-1">Mode de paiement *</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Choisir —</option>
                  {AGENT_PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </div>
              {method && method !== "especes" && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Référence (n° transfert / virement)</label>
                  <input type="text" value={ref} onChange={(e) => setRef(e.target.value)}
                    className="w-full h-9 rounded-lg border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Justificatif (photo ou PDF, optionnel)</label>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                  className="w-full text-xs file:mr-2 file:rounded-lg file:border file:bg-secondary file:px-3 file:py-1.5 file:text-xs" />
                {proof && proof.size > 4.5 * 1024 * 1024 && <p className="text-[11px] text-red-600 mt-1">Fichier trop lourd (max 4,5 Mo).</p>}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optionnel)</label>
                <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="ex: paiement novembre"
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
