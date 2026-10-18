"use client";
import { useState, useTransition } from "react";
import { saveCarrierFees } from "@/lib/delivery/carrier-fees-actions";
import type { CarrierFees, CarrierFee } from "@/lib/delivery/carrier-fees-shared";

const INPUT = "h-9 w-24 rounded-md border bg-background px-2 text-sm text-right";

export function CarrierFeesForm({ initial }: { initial: CarrierFees }) {
  const [f, setF] = useState<CarrierFees>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof CarrierFees, field: keyof CarrierFee, v: string) => {
    setMsg(null);
    setF((x) => ({ ...x, [k]: { ...x[k], [field]: Number(v) } }));
  };
  const rows: { k: keyof CarrierFees; label: string; note?: string }[] = [
    { k: "digylog", label: "Digylog", note: "le vrai frais synchronisé depuis Digylog est utilisé s'il existe" },
    { k: "speedaf", label: "Speedaf" },
  ];
  return (
    <div className="space-y-3">
      <table className="text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr><th className="pr-4 py-1">Transporteur</th><th className="pr-3 py-1">Livraison Casa</th><th className="pr-3 py-1">Livraison autres villes</th><th className="pr-3 py-1">Frais par retour</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td className="pr-4 py-1.5 font-medium">{r.label}</td>
              <td className="pr-3 py-1.5"><input type="number" min={0} className={INPUT} value={f[r.k].casa} onChange={(e) => set(r.k, "casa", e.target.value)} /></td>
              <td className="pr-3 py-1.5"><input type="number" min={0} className={INPUT} value={f[r.k].other} onChange={(e) => set(r.k, "other", e.target.value)} /></td>
              <td className="pr-3 py-1.5"><input type="number" min={0} className={INPUT} value={f[r.k].returnFee} onChange={(e) => set(r.k, "returnFee", e.target.value)} /></td>
              <td className="py-1.5 text-xs text-muted-foreground">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await saveCarrierFees(f);
            setMsg(r.success ? { ok: true, t: "Enregistré ✓" } : { ok: false, t: r.error ?? "Erreur" });
          })}>
          {pending ? "Enregistrement…" : "Enregistrer les frais"}
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.t}</span>}
      </div>
    </div>
  );
}
