"use client";
import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { saveAgentPay } from "@/lib/call-center/pay-actions";
import {
  PAY_MODES, PAY_BASES, PAY_MODE_LABEL, PAY_BASIS_LABEL, usesCommission, usesSalary,
  type AgentPay, type PayMode, type PayBasis,
} from "@/lib/call-center/pay-shared";

/** Rémunération de l'agent — réglable par l'admin, comptée dans le dashboard. */
export function AgentPayForm({ userId, initial, since }: { userId: string; initial: AgentPay; since: string }) {
  const [p, setP] = useState<AgentPay>(initial);
  const [start, setStart] = useState(since.slice(0, 10));
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: Partial<AgentPay>) => { setP((x) => ({ ...x, ...k })); setMsg(null); };

  function save() {
    run(async () => {
      const r = await saveAgentPay(userId, { ...p, since: start });
      setMsg(r.ok ? "✓ Enregistré — appliqué au dashboard et aux commissions" : `✕ ${r.error}`);
    });
  }

  const inp = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4" /> Rémunération</div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Méthode</span>
          <select className={inp} value={p.mode} onChange={(e) => set({ mode: e.target.value as PayMode })}>
            {PAY_MODES.map((m) => <option key={m} value={m}>{PAY_MODE_LABEL[m]}</option>)}
          </select>
        </label>

        {usesSalary(p) && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Salaire mensuel (MAD)</span>
            <input type="number" min={0} step="1" className={inp} value={p.salary}
              onChange={(e) => set({ salary: Number(e.target.value) })} />
          </label>
        )}

        {usesCommission(p) && (<>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Commission (MAD)</span>
            <input type="number" min={0} step="0.5" className={inp} value={p.amount}
              onChange={(e) => set({ amount: Number(e.target.value) })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Payée…</span>
            <select className={inp} value={p.basis} onChange={(e) => set({ basis: e.target.value as PayBasis })}>
              {PAY_BASES.map((b) => <option key={b} value={b}>{PAY_BASIS_LABEL[b]}</option>)}
            </select>
          </label>
        </>)}

        {usesSalary(p) && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Salaire compté à partir du</span>
            <input type="date" className={inp} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {p.mode === "product" && "Le coût de confirmation saisi sur chaque fiche produit est compté pour chaque commande payée de cet agent."}
        {p.mode === "commission" && `${p.amount} MAD ${PAY_BASIS_LABEL[p.basis]}.`}
        {p.mode === "salary" && `${p.salary} MAD / mois, compté au prorata des jours de la période du dashboard.`}
        {p.mode === "hybrid" && `${p.salary} MAD / mois + ${p.amount} MAD ${PAY_BASIS_LABEL[p.basis]}.`}
      </p>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
