"use client";
import { useState, useTransition } from "react";
import { PhoneCall } from "lucide-react";
import { saveCallbackRules } from "@/lib/call-center/actions";
import type { CallbackRules } from "@/lib/call-center/callback-rules";

/** Réglages des rappels automatiques « pas de réponse » (admin). */
export function CcCallbackEditor({ initial }: { initial: CallbackRules }) {
  const [r, setR] = useState({ ...initial, delays: initial.delays.join(", ") });
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const inp = "h-9 rounded-lg border bg-background px-3 text-sm";
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold"><PhoneCall className="h-4 w-4 text-amber-600" /> Rappels automatiques (pas de réponse)</div>
      <p className="text-xs text-muted-foreground">
        Quand l’agent enregistre « Pas de réponse » ou « Injoignable », la commande revient automatiquement dans sa liste
        « À rappeler » après le délai de la tentative (heure Maroc, seulement pendant les heures d’appel). Après le nombre max de tentatives, plus de rappel.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={r.enabled} onChange={(e) => { setR({ ...r, enabled: e.target.checked }); setMsg(null); }} /> Activé
      </label>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <label className="space-y-1 sm:col-span-2 block">
          <span className="font-medium">Délais entre tentatives (minutes : 1er, 2e, 3e… ; le dernier se répète)</span>
          <input className={inp + " w-full font-mono"} value={r.delays} onChange={(e) => { setR({ ...r, delays: e.target.value }); setMsg(null); }} />
          <span className="text-[11px] text-muted-foreground">Ex. 30, 120, 240, 1080, 1440 = 30 min, 2 h, 4 h, 18 h (lendemain matin), 24 h</span>
        </label>
        <label className="space-y-1 block"><span className="font-medium">Tentatives max</span>
          <input type="number" min={1} max={20} className={inp + " w-full"} value={r.maxAttempts} onChange={(e) => setR({ ...r, maxAttempts: Number(e.target.value) })} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 block"><span className="font-medium">Début (h)</span>
            <input type="number" min={0} max={23} className={inp + " w-full"} value={r.hourStart} onChange={(e) => setR({ ...r, hourStart: Number(e.target.value) })} /></label>
          <label className="space-y-1 block"><span className="font-medium">Fin (h)</span>
            <input type="number" min={1} max={24} className={inp + " w-full"} value={r.hourEnd} onChange={(e) => setR({ ...r, hourEnd: Number(e.target.value) })} /></label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending}
          onClick={() => run(async () => { const x = await saveCallbackRules(r); setMsg(x.success ? "✓ Enregistré" : `✕ ${x.error}`); })}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">{pending ? "…" : "Enregistrer"}</button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
