/**
 * lib/dashboard/queries.ts
 * Server-side dashboard data queries.
 * All finance data requires manager+ role — enforced by callers.
 */
import { createClient } from "@/lib/supabase/server";

export interface DashboardSummary {
  total_leads:          number;
  confirmed_count:      number;
  sent_to_delivery_count:number;
  in_transit_count:     number;
  delivered_count:      number;
  paid_count:           number;
  returned_count:       number;
  refused_count:        number;
  no_answer_count:      number;
  cancelled_count:      number;
  estimated_revenue:  number;
  real_revenue:       number;
  estimated_profit:   number;
  real_profit:        number;
  total_cogs:         number;
  total_delivery_cost:number;
  total_return_losses:number;
  pending_collection: number;
  confirmation_rate:  number;
  delivery_rate:      number;
}

export interface ProductPerformance {
  product_id:          string;
  product_name:        string;
  sku:                 string;
  sale_price_mad:      number;
  total_cost_mad:      number;
  unit_profit:         number;
  ads_cost_mad:        number;
  lead_count:          number;
  confirmed_count:     number;
  delivered_count:     number;
  returned_count:      number;
  confirmation_rate:   number;
  delivery_rate:       number;
  total_revenue:       number;
  real_revenue:        number;
  estimated_profit:    number;
  real_profit:         number;
  total_cogs:          number;
  total_delivery_cost: number;
  return_losses:       number;
  real_margin_pct:     number;
  performance_status:  "profitable" | "losing" | "needs_review" | "no_data";
}

export interface DailyFinance {
  day:               string;
  leads:             number;
  confirmed:         number;
  delivered:         number;
  returned:          number;
  estimated_revenue: number;
  real_revenue:      number;
  estimated_profit:  number;
  real_profit:       number;
}

export interface DeliveryClaim {
  id:                       string;
  order_number:             string;
  customer_name:            string;
  customer_phone:           string;
  delivery_tracking_number: string | null;
  total_amount_mad:         number;
  status:                   string;
  is_paid:                  boolean;
  return_cost_mad:          number;
  delivery_cost_real_mad:   number;
  claim_amount:             number;
  claim_type:               "pending_collection" | "return_claim" | "other";
  updated_at:               string;
}

export interface DateFilter {
  from: string; // ISO date
  to:   string;
}

// ── Dashboard summary ──────────────────────────────────────────────────────────
export async function getDashboardSummary(filter?: DateFilter): Promise<DashboardSummary> {
  const supabase = await createClient();

  let q = supabase
    .from("orders")
    .select([
      "status","is_paid","total_amount_mad","estimated_profit",
      "real_profit_mad","cogs_total","delivery_cost_real_mad","return_cost_mad",
    ].join(","))
    .neq("status", "cancelled");

  if (filter) {
    q = q.gte("created_at", filter.from).lte("created_at", filter.to + "T23:59:59");
  }

  const { data } = await q;
  const rows = (data ?? []) as {
    status: string; is_paid: boolean;
    total_amount_mad: number; estimated_profit: number;
    real_profit_mad: number | null; cogs_total: number;
    delivery_cost_real_mad: number; return_cost_mad: number;
  }[];

  const CONFIRMED_STATUSES = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELIVERED_STATUSES = new Set(["delivered","paid"]);

  const total_leads          = rows.length;
  const confirmed_count      = rows.filter((r) => CONFIRMED_STATUSES.has(r.status)).length;
  const sent_to_delivery_count = rows.filter((r) => r.status === "sent_to_delivery").length;
  const in_transit_count     = rows.filter((r) => r.status === "in_transit").length;
  const delivered_count      = rows.filter((r) => DELIVERED_STATUSES.has(r.status)).length;
  const paid_count           = rows.filter((r) => r.status === "paid" && r.is_paid).length;
  const returned_count       = rows.filter((r) => r.status === "returned").length;
  const refused_count        = rows.filter((r) => r.status === "refused").length;
  const no_answer_count      = rows.filter((r) => r.status === "no_answer").length;
  const cancelled_count      = 0;

  const estimated_revenue  = rows.reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
  const real_revenue       = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
  const estimated_profit   = rows.reduce((s, r) => s + (r.estimated_profit ?? 0), 0);
  const real_profit        = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.real_profit_mad ?? 0), 0);
  const total_cogs         = rows.reduce((s, r) => s + (r.cogs_total ?? 0), 0);
  const total_delivery_cost= rows.reduce((s, r) => s + (r.delivery_cost_real_mad ?? 0), 0);
  const total_return_losses= rows.reduce((s, r) => s + (r.return_cost_mad ?? 0), 0);
  const pending_collection = rows
    .filter((r) => DELIVERED_STATUSES.has(r.status) && !r.is_paid)
    .reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);

  const confirmation_rate = total_leads > 0
    ? Math.round(confirmed_count / total_leads * 1000) / 10 : 0;
  const delivery_rate = confirmed_count > 0
    ? Math.round(delivered_count / confirmed_count * 1000) / 10 : 0;

  return {
    total_leads, confirmed_count, sent_to_delivery_count, in_transit_count,
    delivered_count, paid_count, returned_count,
    refused_count, no_answer_count, cancelled_count,
    estimated_revenue, real_revenue, estimated_profit, real_profit,
    total_cogs, total_delivery_cost, total_return_losses, pending_collection,
    confirmation_rate, delivery_rate,
  };
}

// ── Product performance ────────────────────────────────────────────────────────
export async function getProductPerformance(filter?: DateFilter): Promise<ProductPerformance[]> {
  const supabase = await createClient();

  // Two-query pattern to avoid FK join issues
  const { data: products } = await supabase
    .from("products")
    .select("id,name,sku,sale_price_mad,total_cost_mad,estimated_profit_mad,ads_cost_mad,packaging_cost_mad,confirmation_cost_mad,shipping_cost_mad")
    .order("name");

  if (!products?.length) return [];

  const ps = products as {
    id: string; name: string; sku: string; sale_price_mad: number;
    total_cost_mad: number; estimated_profit_mad: number;
    ads_cost_mad: number; packaging_cost_mad: number;
    confirmation_cost_mad: number; shipping_cost_mad: number;
  }[];

  // Fetch order items with their orders
  const { data: items } = await supabase
    .from("order_items")
    .select("product_id,order_id")
    .in("product_id", ps.map((p) => p.id));
  if (!items?.length) return ps.map((p) => makeEmptyPerf(p));

  const orderIds = [...new Set((items as { order_id: string }[]).map((i) => i.order_id))];

  let ordQ = supabase
    .from("orders")
    .select("id,status,is_paid,total_amount_mad,estimated_profit,real_profit_mad,cogs_total,delivery_cost_real_mad,return_cost_mad")
    .in("id", orderIds)
    .neq("status", "cancelled");

  if (filter) {
    ordQ = ordQ.gte("created_at", filter.from).lte("created_at", filter.to + "T23:59:59");
  }

  const { data: orders } = await ordQ;
  type OrderRow = {
    id: string; status: string; is_paid: boolean; total_amount_mad: number;
    estimated_profit: number; real_profit_mad: number | null;
    cogs_total: number; delivery_cost_real_mad: number; return_cost_mad: number;
  };
  const ordersMap = new Map<string, Omit<OrderRow, "id">>();
  for (const o of (orders ?? []) as unknown as OrderRow[]) {
    ordersMap.set(o.id, o);
  }

  // Group items by product
  const productOrders = new Map<string, string[]>();
  for (const item of (items as { product_id: string; order_id: string }[])) {
    if (!productOrders.has(item.product_id)) productOrders.set(item.product_id, []);
    productOrders.get(item.product_id)!.push(item.order_id);
  }

  const CONF = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELV = new Set(["delivered","paid"]);

  return ps.map((p) => {
    const oIds = productOrders.get(p.id) ?? [];
    const rows = oIds.map((id) => ordersMap.get(id)).filter(Boolean) as {
      status: string; is_paid: boolean; total_amount_mad: number;
      estimated_profit: number; real_profit_mad: number | null;
      cogs_total: number; delivery_cost_real_mad: number; return_cost_mad: number;
    }[];

    const lead_count      = rows.length;
    const confirmed_count = rows.filter((r) => CONF.has(r.status)).length;
    const delivered_count = rows.filter((r) => DELV.has(r.status)).length;
    const returned_count  = rows.filter((r) => r.status === "returned").length;

    const confirmation_rate = lead_count > 0
      ? Math.round(confirmed_count / lead_count * 1000) / 10 : 0;
    const delivery_rate = confirmed_count > 0
      ? Math.round(delivered_count / confirmed_count * 1000) / 10 : 0;

    const total_revenue    = rows.reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
    const real_revenue     = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
    const estimated_profit = rows.reduce((s, r) => s + (r.estimated_profit ?? 0), 0);
    const real_profit      = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.real_profit_mad ?? 0), 0);
    const total_cogs       = rows.reduce((s, r) => s + (r.cogs_total ?? 0), 0);
    const total_delivery_cost = rows.reduce((s, r) => s + (r.delivery_cost_real_mad ?? 0), 0);
    const return_losses    = rows.reduce((s, r) => s + (r.return_cost_mad ?? 0), 0);
    const real_margin_pct  = real_revenue > 0
      ? Math.round(real_profit / real_revenue * 1000) / 10 : 0;

    const performance_status =
      lead_count === 0 ? "no_data" :
      real_profit < 0  ? "losing" :
      real_margin_pct >= 15 ? "profitable" : "needs_review";

    return {
      product_id: p.id, product_name: p.name, sku: p.sku,
      sale_price_mad: p.sale_price_mad, total_cost_mad: p.total_cost_mad,
      unit_profit: p.estimated_profit_mad, ads_cost_mad: p.ads_cost_mad,
      lead_count, confirmed_count, delivered_count, returned_count,
      confirmation_rate, delivery_rate, total_revenue, real_revenue,
      estimated_profit, real_profit, total_cogs, total_delivery_cost,
      return_losses, real_margin_pct,
      performance_status: performance_status as ProductPerformance["performance_status"],
    };
  });
}

function makeEmptyPerf(p: { id: string; name: string; sku: string; sale_price_mad: number; total_cost_mad: number; estimated_profit_mad: number; ads_cost_mad: number }): ProductPerformance {
  return {
    product_id: p.id, product_name: p.name, sku: p.sku,
    sale_price_mad: p.sale_price_mad, total_cost_mad: p.total_cost_mad,
    unit_profit: p.estimated_profit_mad, ads_cost_mad: p.ads_cost_mad,
    lead_count: 0, confirmed_count: 0, delivered_count: 0, returned_count: 0,
    confirmation_rate: 0, delivery_rate: 0, total_revenue: 0, real_revenue: 0,
    estimated_profit: 0, real_profit: 0, total_cogs: 0, total_delivery_cost: 0,
    return_losses: 0, real_margin_pct: 0, performance_status: "no_data",
  };
}

// ── Daily finance ──────────────────────────────────────────────────────────────
export async function getDailyFinance(days = 30): Promise<DailyFinance[]> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("orders")
    .select("created_at,status,is_paid,total_amount_mad,estimated_profit,real_profit_mad")
    .gte("created_at", since)
    .neq("status", "cancelled");

  const map = new Map<string, DailyFinance>();
  const CONF = new Set(["confirmed","sent_to_delivery","in_transit","delivered","paid"]);
  const DELV = new Set(["delivered","paid"]);

  for (const o of (data ?? []) as {
    created_at: string; status: string; is_paid: boolean;
    total_amount_mad: number; estimated_profit: number; real_profit_mad: number | null;
  }[]) {
    const day = o.created_at.slice(0, 10);
    if (!map.has(day)) map.set(day, {
      day, leads:0, confirmed:0, delivered:0, returned:0,
      estimated_revenue:0, real_revenue:0, estimated_profit:0, real_profit:0,
    });
    const d = map.get(day)!;
    d.leads++;
    if (CONF.has(o.status)) d.confirmed++;
    if (DELV.has(o.status)) d.delivered++;
    if (o.status === "returned") d.returned++;
    d.estimated_revenue += o.total_amount_mad ?? 0;
    if (o.is_paid) d.real_revenue += o.total_amount_mad ?? 0;
    d.estimated_profit += o.estimated_profit ?? 0;
    if (o.is_paid) d.real_profit += o.real_profit_mad ?? 0;
  }

  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}

// ── Delivery claims ────────────────────────────────────────────────────────────
export async function getDeliveryClaims(): Promise<{ claims: DeliveryClaim[]; total: number }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select("id,order_number,customer_name,customer_phone,delivery_tracking_number,total_amount_mad,status,is_paid,return_cost_mad,delivery_cost_real_mad,updated_at")
    .in("status", ["delivered","paid","returned"])
    .order("updated_at", { ascending: false })
    .limit(200);

  const claims = ((data ?? []) as {
    id: string; order_number: string; customer_name: string; customer_phone: string;
    delivery_tracking_number: string | null; total_amount_mad: number;
    status: string; is_paid: boolean; return_cost_mad: number;
    delivery_cost_real_mad: number; updated_at: string;
  }[])
    .filter((o) =>
      (["delivered","paid"].includes(o.status) && !o.is_paid) ||
      o.status === "returned"
    )
    .map((o) => ({
      ...o,
      claim_amount: ["delivered","paid"].includes(o.status) && !o.is_paid
        ? o.total_amount_mad
        : o.return_cost_mad,
      claim_type: (["delivered","paid"].includes(o.status) && !o.is_paid
        ? "pending_collection"
        : o.status === "returned" ? "return_claim" : "other") as DeliveryClaim["claim_type"],
    }));

  const total = claims.reduce((s, c) => s + c.claim_amount, 0);
  return { claims, total };
}
