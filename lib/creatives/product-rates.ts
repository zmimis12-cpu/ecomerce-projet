/**
 * Taux par PRODUIT — mêmes formules exactes que l'admin (Vue d'ensemble produits) :
 *   Confirmation = commandes confirmées (déjà passées par « confirmé ») / toutes les commandes
 *   Livraison    = livrées / expédiées
 * Calculés sur TOUTES les commandes du produit (pas seulement celles liées à une vidéo).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProductRates = { orders: number; confirmed: number; shipped: number; delivered: number; confirmationRate: number | null; deliveryRate: number | null };

const SHIPPED = new Set(["sent_to_delivery", "in_transit", "delivered", "paid", "exchanged", "returned", "refused_delivery"]);
const DELV = new Set(["delivered", "paid", "exchanged"]);

export async function getProductRates(productIds: string[], from: Date | null, to: Date | null): Promise<Map<string, ProductRates>> {
  const out = new Map<string, ProductRates>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return out;

  // 1) lignes de commande des produits
  const items: { order_id: string; product_id: string }[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    for (let p = 0; p < 20; p++) {
      const { data } = await supabaseAdmin.from("order_items").select("order_id, product_id")
        .in("product_id", ids.slice(i, i + 50)).range(p * 1000, p * 1000 + 999);
      const rows = (data ?? []) as { order_id: string; product_id: string }[];
      items.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  const orderIds = [...new Set(items.map((x) => x.order_id))];

  // 2) commandes (période sur la date de création, comme l'admin)
  const orders = new Map<string, string>();
  for (let i = 0; i < orderIds.length; i += 200) {
    let q = supabaseAdmin.from("orders").select("id, status, created_at").in("id", orderIds.slice(i, i + 200));
    if (from && to) q = q.gte("created_at", from.toISOString()).lt("created_at", to.toISOString());
    const { data } = await q;
    for (const o of (data ?? []) as { id: string; status: string }[]) orders.set(o.id, o.status);
  }
  const live = [...orders.keys()];

  // 3) historique : commandes passées un jour par « confirmé » / « envoyé en livraison »
  const everConf = new Set<string>(), everShip = new Set<string>();
  for (let i = 0; i < live.length; i += 200) {
    const { data } = await supabaseAdmin.from("order_status_history").select("order_id, to_status")
      .in("to_status", ["confirmed", "sent_to_delivery"]).in("order_id", live.slice(i, i + 200));
    for (const h of (data ?? []) as { order_id: string; to_status: string }[]) {
      if (h.to_status === "confirmed") everConf.add(h.order_id); else everShip.add(h.order_id);
    }
  }

  const byProduct = new Map<string, Set<string>>();
  for (const it of items) if (orders.has(it.order_id)) {
    if (!byProduct.has(it.product_id)) byProduct.set(it.product_id, new Set());
    byProduct.get(it.product_id)!.add(it.order_id);
  }
  for (const pid of ids) {
    const os = [...(byProduct.get(pid) ?? [])];
    const st = (id: string) => orders.get(id)!;
    const confirmed = os.filter((id) => everConf.has(id) || st(id) === "confirmed").length;
    const shipped = os.filter((id) => everShip.has(id) || SHIPPED.has(st(id))).length;
    const delivered = os.filter((id) => DELV.has(st(id))).length;
    out.set(pid, {
      orders: os.length, confirmed, shipped, delivered,
      confirmationRate: os.length ? confirmed / os.length : null,
      deliveryRate: shipped ? delivered / shipped : null,
    });
  }
  return out;
}
