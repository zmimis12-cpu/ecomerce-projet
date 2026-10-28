"use client";
import { useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { saveCcWhatsappTemplates } from "@/lib/call-center/pay-actions";
import { CC_WA_LABEL, CC_WA_DEFAULTS, type CcWaKey, type CcWaTemplates } from "@/lib/call-center/whatsapp-templates";

/** Éditeur des messages WhatsApp manuels des agents (admin). */
export function CcWhatsappEditor({ initial }: { initial: CcWaTemplates }) {
  const [t, setT] = useState<CcWaTemplates>(initial);
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const keys = Object.keys(CC_WA_LABEL) as CcWaKey[];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold"><MessageCircle className="h-4 w-4 text-green-600" /> Messages WhatsApp des agents</div>
      <p className="text-xs text-muted-foreground">
        Boutons sur chaque commande du call center → ouvre WhatsApp avec le message prêt. Variables :
        {" {name} {product} {total} {city} {address} {order} {tracking}"}
      </p>
      {keys.map((k) => (
        <label key={k} className="block space-y-1 text-sm">
          <span className="flex items-center justify-between">
            <span className="font-medium">{CC_WA_LABEL[k]}</span>
            <button type="button" className="text-xs text-muted-foreground hover:underline"
              onClick={() => { setT((x) => ({ ...x, [k]: CC_WA_DEFAULTS[k] })); setMsg(null); }}>Par défaut</button>
          </span>
          <textarea dir="rtl" rows={5} value={t[k]}
            onChange={(e) => { setT((x) => ({ ...x, [k]: e.target.value })); setMsg(null); }}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending}
          onClick={() => run(async () => { const r = await saveCcWhatsappTemplates(t); setMsg(r.ok ? "✓ Enregistré" : `✕ ${r.error}`); })}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
