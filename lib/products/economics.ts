/**
 * lib/products/economics.ts — tous les calculs d'UN produit, expliqués (server-only).
 * Mêmes règles que le dashboard :
 *  - marge d'une commande = prix − (achat + emballage) × pièces − vrais frais Digylog
 *  - pub = dépense réelle Meta/TikTok reliée au produit (taxe de chaque compte incluse)
 *  - seules les commandes PAYÉES sont du profit encaissé ; livrées non payées = en attente
 */
import { supabaseAdmin } from "@/lib/supabase/admin";
import { periodRange } from "@/lib/creatives/queries";

export type ProductEconomics = Awaited<ReturnType<typeof productEconomicsDetail>>;

export async function listProducts() {
  const { data } = await supabaseAdmin.from("products").select("id, name, sku, sale_price_mad, is_active").order("name");
  return (data ?? []) as { id: string; name: string; sku: string | null; sale_price_mad: number; is_active: boolean }[];
}

export async function productEconomicsDetail(productId: string, period: string) {
  const { from, to } = periodRange(period);
  const fromIso = from?.toISOString() ?? null, toIso = to?.toISOString() ?? null;
  const fromDay = from?.toISOString().slice(0, 10) ?? null, toDay = to ? new Date(to.getTime() - 86400_000).toISOString().slice(0, 10) : null;

  const { data: p } = await supabaseAdmin.from("products")
    .select("id, name, sku, sale_price_mad, total_cost_mad, ads_cost_mad, confirmation_cost_mad, shipping_cost_mad, packaging_cost_mad, purchase_price_mad")
    .eq("id", productId).single();
  const prod = p as unknown as {
    id: string; name: string; sku: string | null; sale_price_mad: number; total_cost_mad: number;
    ads_cost_mad: number | null; confirmation_cost_mad: number | null; shipping_cost_mad: number | null; packaging_cost_mad: number | null;
    purchase_price_mad: number | null;
  };
  const packaging = Number(prod.packaging_cost_mad ?? 0);
  // Valeurs EXACTES de la fiche produit : achat + emballage (les estimations ne sont pas utilisées)
  const purchase = prod.purchase_price_mad != null ? Number(prod.purchase_price_mad)
    : Math.max(0, Number(prod.total_cost_mad ?? 0) - Number(prod.ads_cost_mad ?? 0) - Number(prod.confirmation_cost_mad ?? 0) - Number(prod.shipping_cost_mad ?? 0) - packaging);
  const perPiece = purchase + packaging;
  const confirmation = Number(prod.confirmation_cost_mad ?? 0);

  // Commandes du produit (période = date de création)
  const { data: items } = await supabaseAdmin.from("order_items").select("order_id, quantity").eq("product_id", productId).limit(10000);
  const qtyOf = new Map<string, number>();
  for (const it of (items ?? []) as { order_id: string; quantity: number }[]) qtyOf.set(it.order_id, (qtyOf.get(it.order_id) ?? 0) + Number(it.quantity ?? 1));
  const ids = [...qtyOf.keys()];
  type O = { id: string; status: string; is_paid: boolean; is_duplicate: boolean; total_amount_mad: number; actual_delivery_cost: number | null;
    expected_delivery_cost: number | null; assigned_to: string | null; editor_earning_mad: number | null; created_at: string };
  let orders: O[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    let q = supabaseAdmin.from("orders")
      .select("id, status, is_paid, is_duplicate, total_amount_mad, actual_delivery_cost, expected_delivery_cost, assigned_to, editor_earning_mad, created_at")
      .in("id", ids.slice(i, i + 150));
    if (fromIso && toIso) q = q.gte("created_at", fromIso).lt("created_at", toIso);
    const { data } = await q;
    orders = orders.concat((data ?? []) as unknown as O[]);
  }
  orders = orders.filter((o) => !o.is_duplicate);

  const c = (st: string[]) => orders.filter((o) => st.includes(o.status)).length;
  const leads = orders.length;
  const pendingCall = c(["new", "no_answer", "callback"]);
  const cancelled = c(["cancelled"]);
  const shipped = c(["sent_to_delivery", "in_transit", "delivered", "paid", "exchanged", "returned", "refused_delivery"]);
  const inTransit = c(["sent_to_delivery", "in_transit"]);
  const delivered = c(["delivered", "paid", "exchanged"]); // échangée = livrée puis échangée
  const returned = c(["returned", "refused_delivery"]);
  const paid = orders.filter((o) => o.is_paid).length;
  const closed = delivered + returned;
  const decided = leads - pendingCall;
  const confirmRate = decided > 0 ? shipped / decided : 0;
  const deliveryRate = closed > 0 ? delivered / closed : 0;

  const delFee = (o: O) => Number(o.actual_delivery_cost ?? o.expected_delivery_cost ?? 35);
  const marginOf = (o: O) => Number(o.total_amount_mad ?? 0) - perPiece * (qtyOf.get(o.id) ?? 1) - delFee(o);
  const sum = (list: O[], f: (o: O) => number) => list.reduce((s, o) => s + f(o), 0);

  const paidOrders = orders.filter((o) => o.is_paid);
  const pendingOrders = orders.filter((o) => !o.is_paid && o.status === "delivered");
  const revenue = sum(paidOrders, (o) => Number(o.total_amount_mad ?? 0));
  const goods = sum(paidOrders, (o) => perPiece * (qtyOf.get(o.id) ?? 1));
  const deliveryCost = sum(paidOrders, delFee);
  const marginBeforeAds = revenue - goods - deliveryCost;
  const pendingMargin = sum(pendingOrders, marginOf) - pendingOrders.length * Number(prod.confirmation_cost_mad ?? 0);
  const pendingRevenue = sum(pendingOrders, (o) => Number(o.total_amount_mad ?? 0));

  // Pub reliée au produit (Meta + TikTok, taxe de chaque compte incluse)
  let aq = supabaseAdmin.from("product_ad_spend").select("platform, spend_mad, period_start").eq("product_id", productId).limit(5000);
  if (fromDay && toDay) aq = aq.gte("period_start", fromDay).lte("period_start", toDay);
  const { data: ads } = await aq;
  const adsByPlatform: Record<string, number> = {};
  for (const r of (ads ?? []) as { platform: string; spend_mad: number }[]) adsByPlatform[r.platform] = (adsByPlatform[r.platform] ?? 0) + Number(r.spend_mad);
  const adSpend = Object.values(adsByPlatform).reduce((a, b) => a + b, 0);

  // Call center (commandes payées traitées par un agent) + éditeurs
  const { data: ag } = await supabaseAdmin.from("call_center_agents").select("user_id");
  const agentIds = new Set(((ag ?? []) as { user_id: string }[]).map((a) => a.user_id));
  const { data: ccSet } = await supabaseAdmin.from("app_settings").select("value").eq("key", "cc_commission_per_order").maybeSingle();
  const ccPer = Number((ccSet as { value?: unknown } | null)?.value ?? 0) || 0;
  // Confirmation = coût exact de la fiche produit × commandes payées
  void agentIds;
  const ccOrders = paidOrders.length;
  const ccCost = ccOrders * confirmation;
  const editorCost = sum(paidOrders, (o) => Number(o.editor_earning_mad ?? 0));

  const netProfit = marginBeforeAds - adSpend - ccCost - editorCost;
  const avgFee = orders.filter((o) => o.actual_delivery_cost).length
    ? sum(orders.filter((o) => o.actual_delivery_cost), delFee) / orders.filter((o) => o.actual_delivery_cost).length : 35;
  const unitMargin = Number(prod.sale_price_mad ?? 0) - perPiece - avgFee - confirmation;
  const ordersToDelivered = confirmRate * deliveryRate;

  return {
    product: { id: prod.id, name: prod.name, sku: prod.sku, price: Number(prod.sale_price_mad ?? 0), purchase, packaging, perPiece },
    counts: { leads, pendingCall, cancelled, shipped, inTransit, delivered, returned, paid, pending: pendingOrders.length },
    rates: { confirmRate, deliveryRate, ordersToDelivered },
    money: {
      revenue, goods, deliveryCost, marginBeforeAds, adSpend, adsByPlatform, ccOrders, ccPer: confirmation, ccCost, editorCost, netProfit,
      pendingMargin, pendingRevenue, netIfPendingPaid: netProfit + pendingMargin,
    },
    unit: {
      avgFee, unitMargin,
      cpo: leads ? adSpend / leads : null,
      cpd: delivered ? adSpend / delivered : null,
      breakEvenCpo: unitMargin * ordersToDelivered,
      breakEvenCpd: unitMargin,
    },
  };
}
