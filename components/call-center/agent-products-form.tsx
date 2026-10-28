"use client";
import { useState, useTransition } from "react";
import { Package } from "lucide-react";
import { saveAgentProducts } from "@/lib/call-center/pay-actions";

/** Produits que cet agent traite. Aucun coché = tous les produits. */
export function AgentProductsForm({ userId, products, initial }: {
  userId: string; products: { id: string; name: string }[]; initial: string[];
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const [pending, run] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (id: string) => { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); setMsg(null); };

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4" /> Produits de l&apos;agent</div>
      <p className="text-xs text-muted-foreground">
        L&apos;agent ne reçoit et ne voit que les commandes des produits cochés. Rien de coché = tous les produits.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2 max-h-64 overflow-y-auto">
        {products.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer hover:bg-secondary/30">
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="truncate">{p.name}</span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={pending}
          onClick={() => run(async () => { const r = await saveAgentProducts(userId, [...sel]); setMsg(r.ok ? "✓ Enregistré" : `✕ ${r.error}`); })}
          className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {pending ? "…" : "Enregistrer"}
        </button>
        <span className="text-xs text-muted-foreground">{sel.size ? `${sel.size} produit(s)` : "Tous les produits"}</span>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  );
}
