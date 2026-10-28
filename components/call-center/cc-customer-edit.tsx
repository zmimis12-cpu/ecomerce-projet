"use client";
import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { updateCcCustomer } from "@/lib/call-center/actions";

/** Modifier nom / ville / adresse du client (avant envoi au livreur). */
export function CcCustomerEdit({ orderId, name, city, address, locked }: {
  orderId: string; name: string; city: string; address: string; locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name, city, address });
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (locked) return null;
  const inp = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <Pencil className="h-3 w-3" /> Modifier nom / ville / adresse
    </button>
  );
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <input className={inp} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Nom" />
      <input className={inp} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} placeholder="Ville" />
      <textarea className={inp} rows={2} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="Adresse" />
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending}
          onClick={() => run(async () => {
            const r = await updateCcCustomer(orderId, v);
            setMsg(r.ok ? "✓ Enregistré" : `✕ ${r.error}`);
            if (r.ok) setTimeout(() => window.location.reload(), 600);
          })}
          className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="text-xs text-muted-foreground hover:underline">Annuler</button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
