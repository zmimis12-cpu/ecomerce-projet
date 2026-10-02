"use client";
import { Plus, Trash2, Star } from "lucide-react";
import { type Offer, MAX_QTY, defaultLabel, presetOffers, savings } from "@/lib/landing-pages/offers";

const IN = "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30";

/**
 * Éditeur d'offres flexibles : autant d'offres que tu veux, n'importe quelle
 * quantité / prix, texte, badge, offre présélectionnée + marge en direct.
 */
export function OffersEditor({ value, onChange, unitPrice, unitGoodsCost, deliveryFee = 35 }: {
  value: Offer[]; onChange: (v: Offer[]) => void; unitPrice: number; unitGoodsCost: number | null; deliveryFee?: number;
}) {
  const upd = (i: number, patch: Partial<Offer>) => onChange(value.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const setDefault = (i: number) => onChange(value.map((o, j) => ({ ...o, isDefault: j === i })));
  const add = () => {
    const last = value[value.length - 1];
    const qty = Math.min(MAX_QTY, (last?.qty ?? 0) + 1);
    onChange([...value, { id: `o${Date.now()}`, qty, price: Math.round(unitPrice * qty * 0.8) }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Préréglages :</span>
        {([
          ["standard", "1 / 2 / 3 pièces"],
          ["buy1get4", "4 pièces au prix d'1"],
          ["buy2get3", "3 pour le prix de 2"],
          ["buy3get4", "4 pour le prix de 3"],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" className="rounded border px-2 py-1 hover:bg-muted"
            onClick={() => onChange(presetOffers(k, unitPrice || 100))}>{l}</button>
        ))}
      </div>

      {value.map((o, i) => {
        const margin = unitGoodsCost != null ? Math.round(o.price - o.qty * unitGoodsCost - deliveryFee) : null;
        const save = savings(o, unitPrice);
        return (
          <div key={o.id} className={`rounded-lg border p-3 ${o.isDefault ? "border-emerald-400 bg-emerald-50/40" : ""}`}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
              <label className="text-[11px] text-muted-foreground sm:col-span-2">Pièces
                <input className={IN} type="number" min={1} max={MAX_QTY} value={o.qty}
                  onChange={(e) => upd(i, { qty: Math.min(MAX_QTY, Math.max(1, Number(e.target.value) || 1)) })} />
              </label>
              <label className="text-[11px] text-muted-foreground sm:col-span-2">Prix total (MAD)
                <input className={IN} type="number" min={1} value={o.price} onChange={(e) => upd(i, { price: Number(e.target.value) })} />
              </label>
              <label className="text-[11px] text-muted-foreground sm:col-span-4">Texte de l&apos;offre
                <input className={IN} dir="auto" placeholder={defaultLabel(o.qty)} value={o.label ?? ""} onChange={(e) => upd(i, { label: e.target.value })} />
              </label>
              <label className="text-[11px] text-muted-foreground sm:col-span-2">Badge
                <input className={IN} dir="auto" placeholder="الأكثر طلباً" value={o.badge ?? ""} onChange={(e) => upd(i, { badge: e.target.value })} />
              </label>
              <div className="flex items-end gap-1 sm:col-span-2">
                <button type="button" title="Offre présélectionnée"
                  className={`h-9 flex-1 rounded-md border text-xs ${o.isDefault ? "border-emerald-500 bg-emerald-600 text-white" : "hover:bg-muted"}`}
                  onClick={() => setDefault(i)}><Star className="mx-auto h-4 w-4" /></button>
                {value.length > 1 && (
                  <button type="button" className="h-9 rounded-md border px-2 text-red-600 hover:bg-red-50"
                    onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
              <label className="text-[11px] text-muted-foreground sm:col-span-12">Petit texte en plus (optionnel)
                <input className={IN} dir="auto" placeholder="هدية مجانية · توصيل مجاني" value={o.note ?? ""} onChange={(e) => upd(i, { note: e.target.value })} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
              <span className="text-muted-foreground">Prix / pièce : <b>{(o.price / o.qty).toFixed(0)} MAD</b></span>
              {save > 0 && <span className="text-emerald-700">Le client économise {save} MAD</span>}
              {margin != null && (
                <span className={margin >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>
                  Ta marge (avant pub) : {margin} MAD {margin < 0 && "⚠️ à perte"}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <Plus className="h-4 w-4" /> Ajouter une offre
      </button>
    </div>
  );
}
