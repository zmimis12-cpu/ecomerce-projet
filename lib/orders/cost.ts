/**
 * Coût d'une commande selon la quantité — partagé (API publique + admin).
 * total_cost_mad du produit = achat + emballage + (pub estimée + confirmation + livraison).
 * Ces 3 dernières sont des coûts PAR COMMANDE (1 colis, 1 appel, 1 clic pub),
 * pas par pièce : une offre "4 pièces" ne paie qu'une livraison.
 */
export type CostProduct = {
  purchase_price_mad?: number | null;
  packaging_cost_mad?: number | null;
  total_cost_mad: number | null;
  ads_cost_mad?: number | null;
  confirmation_cost_mad?: number | null;
  shipping_cost_mad?: number | null;
};

export function orderCost(p: CostProduct, qty: number) {
  const perOrder = (p.ads_cost_mad ?? 0) + (p.confirmation_cost_mad ?? 0) + (p.shipping_cost_mad ?? 0);
  // achat + emballage EXACTS si saisis (sinon ancien calcul depuis le total)
  const perPiece = p.purchase_price_mad != null
    ? Number(p.purchase_price_mad) + Number(p.packaging_cost_mad ?? 0)
    : Math.max(0, (p.total_cost_mad ?? 0) - perOrder);
  const total = perPiece * qty + perOrder;
  return { total: Math.round(total * 100) / 100, perPiece, perOrder, unitEffective: Math.round((total / Math.max(1, qty)) * 100) / 100 };
}
