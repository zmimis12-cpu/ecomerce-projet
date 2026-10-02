"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { saveAdRule, toggleAdRule, deleteAdRule, runAdRulesNow } from "@/lib/ads/rules-actions";
import { METRICS, WINDOWS, ACTIONS, type RuleCondition, type RuleMetric, type RuleOp, type RuleWindow, type RuleAction, type RuleLevel } from "@/lib/ads/rules-types";

const INPUT = "h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function RuleBuilder({ products }: { products: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState<RuleLevel>("product");
  const [productId, setProductId] = useState("");
  const [window, setWindow] = useState<RuleWindow>("today");
  const [action, setAction] = useState<RuleAction>("pause");
  const [simulate, setSimulate] = useState(true);
  const [cooldown, setCooldown] = useState(60);
  const [budgetPct, setBudgetPct] = useState(20);
  const [budgetMax, setBudgetMax] = useState(150);
  const [budgetMin, setBudgetMin] = useState(20);
  const isBudget = action === "increase_budget" || action === "decrease_budget";
  const [conds, setConds] = useState<RuleCondition[]>([
    { metric: "spend", op: ">=", value: 200 },
    { metric: "orders", op: "<", value: 1 },
  ]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const upd = (i: number, patch: Partial<RuleCondition>) => setConds((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className={INPUT} placeholder="Nom (ex: Stop si 0 commande)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={INPUT} value={level} onChange={(e) => setLevel(e.target.value as RuleLevel)}>
          <option value="product">Niveau produit → agit sur ses campagnes</option>
          <option value="ad">Niveau pub → agit sur chaque pub</option>
        </select>
        <select className={INPUT} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Tous les produits</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className={INPUT} value={window} onChange={(e) => setWindow(e.target.value as RuleWindow)}>
          {WINDOWS.map((w) => <option key={w.key} value={w.key}>Période : {w.label}</option>)}
        </select>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">SI (toutes les conditions sont vraies)</p>
        {conds.map((c, i) => (
          <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">{i === 0 ? "SI" : "ET"}</span>
            <select className={INPUT} value={c.metric} onChange={(e) => upd(i, { metric: e.target.value as RuleMetric })}>
              {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select className={INPUT + " w-16"} value={c.op} onChange={(e) => upd(i, { op: e.target.value as RuleOp })}>
              {[">", ">=", "<", "<="].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input className={INPUT + " w-28"} type="number" step="0.01" value={c.value}
              onChange={(e) => upd(i, { value: Number(e.target.value) })} />
            <span className="text-xs text-muted-foreground">{METRICS.find((m) => m.key === c.metric)?.unit}</span>
            {conds.length > 1 && (
              <button type="button" className="rounded border px-2 py-1 text-xs text-red-600"
                onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))}>Retirer</button>
            )}
          </div>
        ))}
        <button type="button" className="text-xs text-primary hover:underline"
          onClick={() => setConds((cs) => [...cs, { metric: "cost_per_order", op: ">", value: 100 }])}>+ Ajouter une condition (ET)</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">ALORS</span>
        <select className={INPUT} value={action} onChange={(e) => {
          const v = e.target.value as RuleAction; setAction(v);
          if (v === "increase_budget" || v === "decrease_budget") setCooldown(2880); // 48 h conseillé
        }}>
          {ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        {isBudget && (
          <>
            <label className="flex items-center gap-1 text-xs">de
              <input className={INPUT + " w-16"} type="number" min={1} max={100} value={budgetPct} onChange={(e) => setBudgetPct(Number(e.target.value))} /> %
            </label>
            {action === "increase_budget" ? (
              <label className="flex items-center gap-1 text-xs">sans dépasser
                <input className={INPUT + " w-20"} type="number" min={1} value={budgetMax} onChange={(e) => setBudgetMax(Number(e.target.value))} /> $/jour
              </label>
            ) : (
              <label className="flex items-center gap-1 text-xs">sans descendre sous
                <input className={INPUT + " w-20"} type="number" min={1} value={budgetMin} onChange={(e) => setBudgetMin(Number(e.target.value))} /> $/jour
              </label>
            )}
          </>
        )}
        <label className="flex items-center gap-1 text-xs">
          Pas plus d&apos;une fois toutes les
          <input className={INPUT + " w-16"} type="number" min={15} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} /> min
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
          Mode simulation (ne touche pas Meta)
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button disabled={pending}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => start(async () => {
            const r = await saveAdRule({ name, level, productId: productId || null, window, conditions: conds, action, simulate, cooldown,
              budgetPct, budgetMaxUsd: budgetMax, budgetMinUsd: budgetMin });
            setMsg(r.success ? { ok: true, text: "Règle enregistrée." } : { ok: false, text: r.error ?? "Erreur" });
            if (r.success) setName("");
          })}>
          <Plus className="h-4 w-4" /> Créer la règle
        </button>
        {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function RuleRowControls({ id, enabled, simulate }: { id: string; enabled: boolean; simulate: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={enabled} disabled={pending}
          onChange={(e) => start(async () => { await toggleAdRule(id, "enabled", e.target.checked); })} /> Active
      </label>
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={simulate} disabled={pending}
          onChange={(e) => {
            if (!e.target.checked && !confirm("Passer en mode RÉEL ? La règle mettra vraiment en pause tes pubs Meta.")) return;
            start(async () => { await toggleAdRule(id, "simulate", e.target.checked); });
          }} /> Simulation
      </label>
      <button disabled={pending} title="Supprimer"
        className="rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        onClick={() => { if (confirm("Supprimer cette règle ?")) start(async () => { await deleteAdRule(id); }); }}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function RunNowButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <div className="flex items-center gap-2">
      <button disabled={pending} onClick={() => start(async () => { const r = await runAdRulesNow(); setMsg(r.success ? r.info ?? "OK" : r.error ?? "Erreur"); })}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50">
        <Play className="h-4 w-4" /> {pending ? "Vérification…" : "Vérifier maintenant"}
      </button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
