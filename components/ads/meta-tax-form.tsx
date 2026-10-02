"use client";
import { useState, useTransition } from "react";
import { saveMetaTax } from "@/lib/ads/tax-actions";

export function MetaTaxForm({ pct, since }: { pct: number; since: string | null }) {
  const [p, setP] = useState(pct || 20);
  const [d, setD] = useState(since ?? new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span>Taxe Meta (TVA)</span>
      <input type="number" min={0} max={50} value={p} onChange={(e) => setP(Number(e.target.value))}
        className="h-8 w-16 rounded-md border bg-background px-2" /> %
      <span>depuis le</span>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="h-8 rounded-md border bg-background px-2" />
      <button disabled={pending} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        onClick={() => start(async () => { const r = await saveMetaTax(p, d); setMsg(r.success ? r.info ?? "OK" : r.error ?? "Erreur"); })}>
        {pending ? "Recalcul…" : "Enregistrer et recalculer"}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
