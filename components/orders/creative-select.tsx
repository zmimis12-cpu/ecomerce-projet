"use client";
import type { CreativeOption } from "@/lib/creatives/queries";

/**
 * Select "Vidéo" pour attribuer une commande (WhatsApp, téléphone…) à la vidéo
 * d'un éditeur. Les vidéos du produit choisi apparaissent en premier.
 */
export function CreativeSelect({
  creatives, productId, value, onChange, name, disabled, className,
}: {
  creatives: CreativeOption[];
  productId?: string;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
}) {
  const forProduct = productId ? creatives.filter((c) => c.productId === productId) : [];
  const others = creatives.filter((c) => !forProduct.includes(c));
  const label = (c: CreativeOption) =>
    `${c.code} — ${c.title} · ${c.editorName}${c.status !== "in_ads" ? " (hors pub)" : ""}`;

  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={className}>
      <option value="">— Aucune / inconnue —</option>
      {forProduct.length > 0 && (
        <optgroup label="Vidéos de ce produit">
          {forProduct.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </optgroup>
      )}
      {others.length > 0 && (
        <optgroup label={forProduct.length ? "Autres vidéos" : "Vidéos"}>
          {others.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </optgroup>
      )}
    </select>
  );
}
