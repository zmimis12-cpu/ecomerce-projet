"use client";
import { useRef, useState, useTransition } from "react";
import { Trash2, Wallet } from "lucide-react";
import { addEditorPayment, deleteEditorPayment } from "@/lib/creatives/payments";

const INPUT = "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function AddPaymentForm({ editors }: { editors: { id: string; name: string; remaining: number }[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [editorId, setEditorId] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const selected = editors.find((e) => e.id === editorId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await addEditorPayment(fd);
          if (r.success) {
            setMsg({ ok: true, text: "Paiement enregistré." });
            formRef.current?.reset();
            setEditorId(""); setAmount("");
          } else {
            setMsg({ ok: false, text: r.error ?? "Erreur" });
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Éditeur *
          <select name="editor_id" className={INPUT + " w-full"} value={editorId}
            onChange={(e) => { setEditorId(e.target.value); setAmount(""); }}>
            <option value="">Choisir…</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>{e.name} — reste {e.remaining.toFixed(2)} MAD</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Montant (MAD) *
          <div className="flex gap-1.5">
            <input name="amount" type="number" min="0.01" step="0.01" className={INPUT + " w-full"}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
            {selected && selected.remaining > 0 && (
              <button type="button" className="h-9 whitespace-nowrap rounded-md border px-2 text-xs hover:bg-muted"
                onClick={() => setAmount(selected.remaining.toFixed(2))}>
                Tout ({selected.remaining.toFixed(0)})
              </button>
            )}
          </div>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Date *
          <input name="paid_on" type="date" defaultValue={today} className={INPUT + " w-full"} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Méthode
          <select name="method" defaultValue="virement" className={INPUT + " w-full"}>
            <option value="virement">Virement</option>
            <option value="cash">Espèces</option>
            <option value="wafacash">Wafacash</option>
            <option value="cashplus">Cash Plus</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Référence (n° virement…)
          <input name="reference" className={INPUT + " w-full"} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Justificatif (photo ou PDF, max 4,5 Mo)
          <input name="proof" type="file" accept="image/*,application/pdf"
            className="block w-full text-sm file:mr-2 file:rounded-md file:border file:bg-background file:px-2 file:py-1 file:text-xs" />
        </label>
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">
        Note
        <input name="note" className={INPUT + " w-full"} placeholder="ex: paiement septembre" />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Wallet className="h-4 w-4" /> {pending ? "Enregistrement…" : "Enregistrer le paiement"}
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function DeletePaymentButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title="Supprimer ce paiement"
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      onClick={() => {
        if (!confirm("Supprimer ce paiement et son justificatif ?")) return;
        start(async () => { const r = await deleteEditorPayment(id); if (!r.success) alert(r.error); });
      }}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
