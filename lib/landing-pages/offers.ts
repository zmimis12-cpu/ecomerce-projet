/**
 * Offres flexibles d'une landing page — partagé client / serveur.
 * Exemples : 1 pièce 149 · 2 pièces 249 · "4 pièces au prix d'une" 149 · "3 + 1 gratuit".
 */
export type Offer = {
  id: string;
  qty: number;          // nombre de pièces livrées
  price: number;        // prix TOTAL payé par le client (MAD)
  label?: string;       // ex : "4 قطع بثمن قطعة وحدة"
  note?: string;        // ex : "هدية مجانية + توصيل مجاني"
  badge?: string;       // ex : "الأكثر طلباً"
  isDefault?: boolean;  // présélectionnée
};

export const MAX_QTY = 10;

export function defaultLabel(qty: number) {
  if (qty === 1) return "قطعة واحدة";
  if (qty === 2) return "2 قطع";
  return `${qty} قطع`;
}

/** Offres valides de la LP ; sinon anciennes offres 1/2/3 (compatibilité). */
export function normalizeOffers(raw: unknown, legacy: { price: number; b1?: number | null; b2?: number | null; b3?: number | null }): Offer[] {
  if (Array.isArray(raw)) {
    const list = (raw as Partial<Offer>[])
      .map((o, i) => ({
        id: String(o.id ?? `o${i + 1}`),
        qty: Math.min(MAX_QTY, Math.max(1, Math.round(Number(o.qty) || 1))),
        price: Math.max(0, Number(o.price) || 0),
        label: o.label?.toString().trim() || undefined,
        note: o.note?.toString().trim() || undefined,
        badge: o.badge?.toString().trim() || undefined,
        isDefault: !!o.isDefault,
      }))
      .filter((o) => o.price > 0);
    if (list.length) return list;
  }
  const p = legacy.price;
  return [
    { id: "q1", qty: 1, price: Number(legacy.b1 || p) },
    { id: "q2", qty: 2, price: Number(legacy.b2 || Math.round(p * 2 * 0.9)), badge: "الأوفر", isDefault: false },
    { id: "q3", qty: 3, price: Number(legacy.b3 || Math.round(p * 3 * 0.8)) },
  ];
}

/** Économie affichée au client par rapport au prix normal × quantité. */
export function savings(offer: Offer, unitPrice: number) {
  return Math.max(0, Math.round(unitPrice * offer.qty - offer.price));
}

/** Préréglages pour le constructeur. */
export function presetOffers(kind: "standard" | "buy1get4" | "buy2get3" | "buy3get4", unitPrice: number): Offer[] {
  const p = Math.round(unitPrice);
  switch (kind) {
    case "buy1get4": return [
      { id: "o1", qty: 1, price: p },
      { id: "o2", qty: 4, price: p, label: "4 قطع بثمن قطعة وحدة 🔥", badge: "عرض خاص", isDefault: true },
    ];
    case "buy2get3": return [
      { id: "o1", qty: 1, price: p },
      { id: "o2", qty: 3, price: p * 2, label: "خود 3 وخلّص 2", badge: "الأكثر طلباً", isDefault: true },
    ];
    case "buy3get4": return [
      { id: "o1", qty: 1, price: p },
      { id: "o2", qty: 2, price: Math.round(p * 1.8) },
      { id: "o3", qty: 4, price: p * 3, label: "خود 4 وخلّص 3", badge: "الأوفر", isDefault: true },
    ];
    default: return [
      { id: "o1", qty: 1, price: p },
      { id: "o2", qty: 2, price: Math.round(p * 1.8), badge: "الأكثر طلباً", isDefault: true },
      { id: "o3", qty: 3, price: Math.round(p * 2.4) },
    ];
  }
}
