/**
 * Prix selon la quantité pour le call center (server only).
 * Règle : si la LP de la commande a une offre pour cette quantité (ex. 2 = 1099), on prend ce prix ;
 * sinon prix catalogue (fiche produit) × quantité. Tout se règle depuis l'admin (offres LP + fiche produit).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

type Offer = { qty?: number; price?: number };

export async function qtyPriceTable(productId: string | null, lpSlug: string | null, fallbackUnit: number, maxQty = 5): Promise<Record<number, number>> {
  let unit = fallbackUnit;
  if (productId) {
    const { data } = await supabaseAdmin.from("products").select("sale_price_mad").eq("id", productId).maybeSingle();
    const p = Number((data as { sale_price_mad?: number } | null)?.sale_price_mad ?? 0);
    if (p > 0) unit = p;
  }
  let offers: Offer[] = [];
  if (lpSlug) {
    const { data } = await supabaseAdmin.from("landing_pages").select("offers, product_id").eq("slug", lpSlug).maybeSingle();
    const lp = data as { offers?: Offer[] | null; product_id?: string | null } | null;
    if (lp && (!productId || lp.product_id === productId) && Array.isArray(lp.offers)) offers = lp.offers;
  }
  const out: Record<number, number> = {};
  for (let q = 1; q <= maxQty; q++) {
    const o = offers.find((x) => Number(x.qty) === q && Number(x.price) > 0);
    out[q] = Math.round((o ? Number(o.price) : unit * q) * 100) / 100;
  }
  return out;
}
