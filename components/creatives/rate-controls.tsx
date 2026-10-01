"use client";
import { useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { saveEditorRate, deleteEditorRate } from "@/lib/creatives/actions";

const INPUT = "h-9 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

export function RateForm({ editors, products }: {
  editors: { id: string; name: string }[]; products: { id: string; name: string }[];
}) {
  const [editorId, setEditorId] = useState("");
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"fixed" | "percent">("fixed");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={INPUT} value={editorId} onChange={(e) => setEditorId(e.target.value)}>
        <option value="">Tous les éditeurs</option>
        {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select className={INPUT} value={productId} onChange={(e) => setProductId(e.target.value)}>
        <option value="">Produit…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input className={INPUT + " w-24"} type="number" min={0} step="0.5" placeholder="Montant"
        value={value} onChange={(e) => setValue(e.target.value)} />
      <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="fixed">MAD / livrée</option>
        <option value="percent">% du montant</option>
      </select>
      <button disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        onClick={() => start(async () => {
          const r = await saveEditorRate({ editorId: editorId || null, productId, type, value: Number(value) });
          setMsg(r.success ? { ok: true, text: "Tarif enregistré." } : { ok: false, text: r.error ?? "Erreur" });
          if (r.success) setValue("");
        })}>
        <Plus className="h-4 w-4" /> Enregistrer
      </button>
      {msg && <span className={msg.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{msg.text}</span>}
    </div>
  );
}

export function DeleteRateButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} title="Supprimer ce tarif"
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
      onClick={() => { if (confirm("Supprimer ce tarif ?")) start(async () => { await deleteEditorRate(id); }); }}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
