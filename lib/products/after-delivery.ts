/**
 * lib/products/after-delivery.ts — « Après livraison » : par produit, combien
 * coûte VRAIMENT la pub par commande livrée, et combien ça coûtera une fois
 * les colis en route arrivés (projection avec le taux de livraison).
 *
 * Lecture seule. 3 requêtes groupées (commandes de la période, lignes, pub
 * synchronisée) → léger pour Supabase.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readCarrierFees, getCarrierResolver, deliveryFee } from "@/lib/delivery/carrier-fees";

const DELIVERED = new Set(["delivered", "paid", "exchanged"]);
const RETURNED  = new Set(["returned", "refused_delivery", "partially_returned"]);
const ON_ROAD   = new Set(["sent_to_delivery", "in_transit", "not_sent", "shipped"]);
const TO_SHIP   = new Set(["confirmed", "processing"]);
const CANCELLED = new Set(["cancelled", "refused", "no_answer"]);

export type AfterDeliveryRow = {
  product_id: string;
  name: string;
  image: string | null;
  sale_price: number;
  spend: number;            // pub de la période (MAD)
  orders: number;           // commandes reçues
  cancelled: number;        // annulées / refusées au téléphone / sans réponse
  pendingCall: number;      // pas encore traitées
  confirmed: number;        // confirmées (toutes étapes après confirmation)
  toShip: number;           // confirmées pas encore envoyées
  onRoad: number;           // chez le transporteur / notre livreur
  delivered: number;
  returned: number;
  confirmRate: number | null;   // confirmées / traitées
  deliveryRate: number;         // livrées / (livrées + retours) — produit, sinon global
  deliveryRateSource: "produit" | "global";
  marginPerDelivered: number;   // vente − achat − emballage − livraison (moyenne)
  profitNow: number;            // marge livrées − retours − pub
  projectedDelivered: number;   // livrées + (en route + à envoyer) × taux
  profitProjected: number;
  cpo: number | null;           // pub / commande
  cpConfirmed: number | null;   // pub / confirmée
  cpDelivered: number | null;   // pub / livrée (aujourd'hui)
  cpDeliveredProjected: number | null;
};

type OrderRow = {
  id: string; status: string; total_amount_mad: number | null; customer_city: string | null;
  actual_delivery_cost: number | null; delivery_company_id: string | null;
  fulfillment_type: string | null; metadata: Record<string, unknown> | null; is_duplicate: boolean | null; is_exchange: boolean | null;
};
type ItemRow = { order_id: string; product_id: string | null; quantity: number | null; line_total: number | null };

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 50; p++) {
    const { data } = await build(p * 1000, p * 1000 + 999);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function getAfterDelivery(from: string, to: string): Promise<{ rows: AfterDeliveryRow[]; globalRate: number; totals: AfterDeliveryRow }> {
  const toEnd = `${to}T23:59:59`;
  const [orders, fees, carrierOf] = await Promise.all([
    fetchAll<OrderRow>((a, b) => supabaseAdmin.from("orders")
      .select("id,status,total_amount_mad,customer_city,actual_delivery_cost,delivery_company_id,fulfillment_type,metadata,is_duplicate,is_exchange")
      .gte("created_at", from).lte("created_at", toEnd).order("created_at").range(a, b)),
    readCarrierFees(),
    getCarrierResolver(),
  ]);
  const live = orders.filter((o) => !o.is_duplicate);
  const ids = live.map((o) => o.id);

  const items: ItemRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin.from("order_items")
      .select("order_id,product_id,quantity,line_total").in("order_id", ids.slice(i, i + 200));
    items.push(...((data ?? []) as ItemRow[]));
  }

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const [{ data: prods }, { data: spendRows }, { data: imgs }, { data: rateRows }] = await Promise.all([
    supabaseAdmin.from("products").select("id,name,sale_price_mad,purchase_price_mad,packaging_cost_mad").in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("product_ad_spend").select("product_id,spend_mad,period_start,period_end").gte("period_start", from).lte("period_end", to),
    supabaseAdmin.from("product_images").select("product_id,public_url,is_primary,display_order").in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]),
    // Taux de livraison global (90 derniers jours) quand un produit n'a pas encore assez de colis terminés
    supabaseAdmin.from("orders").select("status").in("status", [...DELIVERED, ...RETURNED])
      .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(5000),
  ]);

  const rr = (rateRows ?? []) as { status: string }[];
  const gDel = rr.filter((r) => DELIVERED.has(r.status)).length;
  const globalRate = rr.length ? gDel / rr.length : 0.65;

  type P = { id: string; name: string; sale_price_mad: number | null; purchase_price_mad: number | null; packaging_cost_mad: number | null };
  const prodMap = new Map(((prods ?? []) as P[]).map((p) => [p.id, p]));
  const spend = new Map<string, number>();
  for (const s of (spendRows ?? []) as { product_id: string; spend_mad: number }[]) {
    spend.set(s.product_id, (spend.get(s.product_id) ?? 0) + Number(s.spend_mad || 0));
  }
  const image = new Map<string, string>();
  for (const im of ((imgs ?? []) as { product_id: string; public_url: string; is_primary: boolean | null }[])) {
    if (!image.has(im.product_id) || im.is_primary) image.set(im.product_id, im.public_url);
  }

  const orderMap = new Map(live.map((o) => [o.id, o]));
  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const it of items) {
    if (!it.product_id) continue;
    const arr = itemsByOrder.get(it.order_id) ?? []; arr.push(it); itemsByOrder.set(it.order_id, arr);
  }

  type Acc = { orders: number; cancelled: number; pendingCall: number; toShip: number; onRoad: number; delivered: number; returned: number; margin: number; returnCost: number };
  const acc = new Map<string, Acc>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = { orders: 0, cancelled: 0, pendingCall: 0, toShip: 0, onRoad: 0, delivered: 0, returned: 0, margin: 0, returnCost: 0 }; acc.set(id, a); }
    return a;
  };

  for (const [orderId, its] of itemsByOrder) {
    const o = orderMap.get(orderId); if (!o) continue;
    const totalLines = its.reduce((s, i) => s + Number(i.line_total || 0), 0);
    const carrier = carrierOf(o);
    const selfFee = Number((o.metadata as { self_delivery_fee?: unknown } | null)?.self_delivery_fee ?? 0) || 0;
    const livFee = carrier === "self" ? selfFee : deliveryFee(fees, carrier, o.customer_city, o.actual_delivery_cost);
    const retFee = carrier === "self" ? selfFee : fees[carrier].returnFee;
    for (const it of its) {
      const share = totalLines > 0 ? Number(it.line_total || 0) / totalLines : 1 / its.length;
      const a = get(it.product_id!);
      // Échange (remplacement d'un produit déjà vendu) : pas une vente en plus,
      // son coût (produit renvoyé + livraison − frais encaissés) est une perte.
      if (o.is_exchange) {
        if (DELIVERED.has(o.status) || ON_ROAD.has(o.status) || RETURNED.has(o.status)) {
          const p = prodMap.get(it.product_id!);
          const goods = ((p?.purchase_price_mad ?? 0) + (p?.packaging_cost_mad ?? 0)) * Number(it.quantity || 1);
          a.returnCost += Math.max(0, goods + livFee * share - Number(o.total_amount_mad || 0) * share);
        }
        continue;
      }
      a.orders += share;
      const st = o.status;
      if (DELIVERED.has(st)) {
        const p = prodMap.get(it.product_id!);
        const qty = Number(it.quantity || 1);
        const goods = ((p?.purchase_price_mad ?? 0) + (p?.packaging_cost_mad ?? 0)) * qty;
        a.delivered += share;
        a.margin += (Number(o.total_amount_mad || 0) * share) - goods - livFee * share;
      } else if (RETURNED.has(st)) { a.returned += share; a.returnCost += retFee * share; }
      else if (ON_ROAD.has(st)) a.onRoad += share;
      else if (TO_SHIP.has(st)) a.toShip += share;
      else if (CANCELLED.has(st)) a.cancelled += share;
      else a.pendingCall += share;
    }
  }

  // Produits avec de la pub mais 0 commande : on les montre aussi
  for (const pid of spend.keys()) if (!acc.has(pid)) get(pid);
  const missing = [...acc.keys()].filter((id) => !prodMap.has(id));
  if (missing.length) {
    const { data } = await supabaseAdmin.from("products").select("id,name,sale_price_mad,purchase_price_mad,packaging_cost_mad").in("id", missing);
    for (const p of (data ?? []) as P[]) prodMap.set(p.id, p);
  }

  const build = (id: string, name: string, img: string | null, price: number, a: Acc, sp: number, estMargin: number): AfterDeliveryRow => {
    const finished = a.delivered + a.returned;
    const useProduct = finished >= 5;
    const rate = useProduct ? a.delivered / finished : globalRate;
    const confirmed = a.toShip + a.onRoad + a.delivered + a.returned;
    const treated = confirmed + a.cancelled;
    const m = a.delivered > 0 ? a.margin / a.delivered : estMargin;
    // À venir : colis en route + confirmés à envoyer + commandes pas encore appelées × taux de confirmation
    const cRate = treated >= 5 ? confirmed / treated : 0.6;
    const coming = a.onRoad + a.toShip + a.pendingCall * cRate;
    const futureDel = coming * rate;
    const futureRet = coming * (1 - rate);
    const avgRet = a.returned > 0 ? a.returnCost / a.returned : 0;
    const projDel = a.delivered + futureDel;
    const r1 = (n: number) => Math.round(n * 10) / 10;
    return {
      product_id: id, name, image: img, sale_price: price, spend: Math.round(sp),
      orders: r1(a.orders), cancelled: r1(a.cancelled), pendingCall: r1(a.pendingCall), confirmed: r1(confirmed),
      toShip: r1(a.toShip), onRoad: r1(a.onRoad), delivered: r1(a.delivered), returned: r1(a.returned),
      confirmRate: treated > 0 ? confirmed / treated : null,
      deliveryRate: rate, deliveryRateSource: useProduct ? "produit" : "global",
      marginPerDelivered: Math.round(m),
      profitNow: Math.round(a.margin - a.returnCost - sp),
      projectedDelivered: r1(projDel),
      profitProjected: Math.round(a.margin - a.returnCost + futureDel * m - futureRet * avgRet - sp),
      cpo: a.orders > 0 ? Math.round(sp / a.orders) : null,
      cpConfirmed: confirmed > 0 ? Math.round(sp / confirmed) : null,
      cpDelivered: a.delivered > 0 ? Math.round(sp / a.delivered) : null,
      cpDeliveredProjected: projDel > 0 ? Math.round(sp / projDel) : null,
    };
  };

  const rows: AfterDeliveryRow[] = [];
  const tot: Acc = { orders: 0, cancelled: 0, pendingCall: 0, toShip: 0, onRoad: 0, delivered: 0, returned: 0, margin: 0, returnCost: 0 };
  let totSpend = 0;
  for (const [pid, a] of acc) {
    const p = prodMap.get(pid);
    const price = Number(p?.sale_price_mad ?? 0);
    const est = price - (p?.purchase_price_mad ?? 0) - (p?.packaging_cost_mad ?? 0) - fees.digylog.other;
    const sp = spend.get(pid) ?? 0;
    if (a.orders === 0 && sp < 1) continue;
    rows.push(build(pid, p?.name ?? "Produit", image.get(pid) ?? null, price, a, sp, est));
    for (const k of Object.keys(tot) as (keyof Acc)[]) tot[k] += a[k];
    totSpend += sp;
  }
  rows.sort((x, y) => y.spend - x.spend || y.orders - x.orders);
  const totals = build("total", "Total", null, 0, tot, totSpend, rows.length ? rows.reduce((s, r) => s + r.marginPerDelivered, 0) / rows.length : 0);
  return { rows, globalRate, totals };
}
