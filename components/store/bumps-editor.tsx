"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { saveStoreBumps } from "@/lib/store/actions";
import type { BumpConfig } from "@/lib/store/catalog";

type Main = { id: string; title: string; image: string | null; price: number; slug: string };
type Cat = { id: string; name: string; price: number; cost: number | null };

export function StoreBumpsEditor({ mains, catalog, initial }: { mains: Main[]; catalog: Cat[]; initial: Record<string, BumpConfig[]> }) {
  const [cfg, setCfg] = useState<Record<string, BumpConfig[]>>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const catOf = new Map(catalog.map((c) => [c.id, c]));

  function update(pid: string, list: BumpConfig[]) { setCfg((c) => ({ ...c, [pid]: list })); setMsg(""); }

  return (
    <div className="space-y-4">
      {mains.map((m) => {
        const list = cfg[m.id] ?? [];
        return (
          <div key={m.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                {m.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold" dir="auto">{m.title}</p>
                <p className="text-xs text-muted-foreground">{m.price} MAD</p>
              </div>
              <a href={`/lp/${m.slug}`} target="_blank" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">Voir <ExternalLink className="h-3 w-3" /></a>
            </div>
            <div className="space-y-2">
              {list.map((b, i) => {
                const c = catOf.get(b.product_id);
                const margin = c?.cost != null ? Number(b.price) - c.cost : null;
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2">
                    <select value={b.product_id} onChange={(e) => update(m.id, list.map((x, j) => j === i ? { ...x, product_id: e.target.value } : x))}
                      className="h-9 min-w-[200px] flex-1 rounded-md border bg-background px-2 text-sm">
                      {catalog.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.price} MAD)</option>)}
                    </select>
                    <input type="number" min={1} value={b.price} onChange={(e) => update(m.id, list.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))}
                      className="h-9 w-24 rounded-md border bg-background px-2 text-sm" title="Prix spécial (MAD)" />
                    <input placeholder="Texte (optionnel, ex : حامل ثلاثي للبروجيكتور)" value={b.label ?? ""} dir="auto"
                      onChange={(e) => update(m.id, list.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      className="h-9 min-w-[180px] flex-1 rounded-md border bg-background px-2 text-sm" />
                    {margin != null && (
                      <span className={`text-xs font-medium ${margin > 0 ? "text-green-700" : "text-red-600"}`}>marge {margin.toFixed(0)} MAD</span>
                    )}
                    <button onClick={() => update(m.id, list.filter((_, j) => j !== i))} className="rounded-md p-2 text-red-600 hover:bg-red-50" title="Retirer">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
              {list.length < 3 && (
                <button
                  onClick={() => { const first = catalog.find((x) => x.id !== m.id); if (first) update(m.id, [...list, { product_id: first.id, price: Math.max(1, Math.round(first.price * 0.6)) }]); }}
                  className="flex items-center gap-1 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-brand hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" /> Ajouter un upsell
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="sticky bottom-4 flex items-center gap-3">
        <button disabled={pending} onClick={() => start(async () => { const r = await saveStoreBumps(cfg); setMsg(r.success ? "✅ Enregistré — visible sur la boutique en moins de 2 min" : `❌ ${r.error}`); })}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer les upsells"}
        </button>
        {msg && <span className="rounded-md bg-card px-3 py-1.5 text-sm shadow">{msg}</span>}
      </div>
    </div>
  );
}
