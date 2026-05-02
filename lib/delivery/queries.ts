/**
 * lib/delivery/queries.ts
 */
import { createClient } from "@/lib/supabase/server";
import type { DeliveryOrder } from "@/types/delivery";

const DELIVERY_LIST_FIELDS = `
  id, order_number, customer_name, customer_phone, customer_city,
  status, delivery_status, delivery_tracking_number, delivery_company,
  delivery_cost_real_mad, return_cost_mad,
  sent_to_delivery_at, delivered_at, returned_at,
  is_paid, paid_at, total_amount_mad, estimated_profit, real_profit_mad,
  created_at
`;

const DELIVERY_DETAIL_FIELDS = `
  id, order_number, customer_name, customer_phone, customer_city,
  customer_address, customer_region,
  status, delivery_status, delivery_tracking_number, delivery_company,
  delivery_cost_real_mad, return_cost_mad,
  sent_to_delivery_at, delivered_at, returned_at, is_paid, paid_at,
  total_amount_mad, subtotal, shipping_charge,
  estimated_profit, real_profit_mad,
  estimated_ads_cost, estimated_confirmation_cost,
  cogs_total, notes, confirmed_at, created_at, updated_at
`;

export interface DeliveryFilters {
  deliveryStatus?: string;
  isPaid?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

/** Orders in delivery pipeline */
export async function getDeliveryOrders(
  filters: DeliveryFilters = {}
): Promise<DeliveryOrder[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(DELIVERY_LIST_FIELDS)
    .not("status", "in", '("new","refused","no_answer","cancelled","pending")')
    .order("sent_to_delivery_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.deliveryStatus && filters.deliveryStatus !== "all") {
    query = query.eq("delivery_status", filters.deliveryStatus);
  }
  if (filters.isPaid !== undefined) {
    query = query.eq("is_paid", filters.isPaid);
  }
  if (filters.search) {
    const q = filters.search;
    query = query.or(
      `order_number.ilike.%${q}%,customer_name.ilike.%${q}%,` +
      `customer_phone.ilike.%${q}%,delivery_tracking_number.ilike.%${q}%`
    );
  }
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo)   query = query.lte("created_at", filters.dateTo + "T23:59:59");

  const { data, error } = await query;
  if (error) { console.error("[delivery] getDeliveryOrders:", error.message); return []; }

  const orders = (data ?? []) as unknown as DeliveryOrder[];
  if (orders.length === 0) return [];

  // Fetch first product per order
  const ids = orders.map((o) => o.id);
  const { data: items } = await supabase
    .from("order_items")
    .select("order_id, product_name")
    .in("order_id", ids);

  const productMap: Record<string, string> = {};
  for (const item of (items ?? []) as unknown as { order_id: string; product_name: string }[]) {
    if (!productMap[item.order_id]) productMap[item.order_id] = item.product_name;
  }

  return orders.map((o) => ({ ...o, first_product_name: productMap[o.id] ?? null }));
}

/** Full order detail for delivery page */
export async function getDeliveryOrderDetail(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(DELIVERY_DETAIL_FIELDS)
    .eq("id", id)
    .single();

  if (error || !data) { console.error("[delivery] getDeliveryOrderDetail:", error?.message); return null; }

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name, product_sku, quantity, unit_price, unit_cost_mad, line_total, line_cogs, line_gross_profit")
    .eq("order_id", id);

  const { data: history } = await supabase
    .from("order_status_history")
    .select("id, from_status, to_status, notes, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  return {
    order:   data as unknown as DeliveryOrder & {
      customer_address: string; customer_region: string | null;
      confirmed_at: string | null; subtotal: number; shipping_charge: number;
      cogs_total: number | null; notes: string | null;
      estimated_ads_cost: number | null; estimated_confirmation_cost: number | null;
    },
    items:   (items   ?? []) as unknown as { id: string; product_name: string; product_sku: string; quantity: number; unit_price: number; unit_cost_mad: number; line_total: number; line_cogs: number; line_gross_profit: number }[],
    history: (history ?? []) as unknown as { id: string; from_status: string | null; to_status: string; notes: string | null; created_at: string }[],
  };
}

/** Summary KPIs for delivery dashboard */
export async function getDeliverySummary() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, delivery_status, is_paid, real_profit_mad, total_amount_mad")
    .not("delivery_status", "is", null);

  const rows = (data ?? []) as { id: string; delivery_status: string; is_paid: boolean; real_profit_mad: number | null; total_amount_mad: number }[];

  const total          = rows.length;
  const in_transit     = rows.filter((r) => r.delivery_status === "in_transit").length;
  const delivered      = rows.filter((r) => r.delivery_status === "delivered").length;
  const paid           = rows.filter((r) => r.is_paid).length;
  const returned       = rows.filter((r) => ["returned","refused_delivery"].includes(r.delivery_status)).length;
  const totalRevenue   = rows.filter((r) => r.is_paid).reduce((s, r) => s + (r.total_amount_mad ?? 0), 0);
  const realProfits    = rows.filter((r) => r.real_profit_mad !== null).map((r) => r.real_profit_mad!);
  const totalProfit    = realProfits.reduce((s, p) => s + p, 0);
  const deliveryRate   = total === 0 ? 0 : Math.round((delivered / total) * 100);

  return { total, in_transit, delivered, paid, returned, totalRevenue, totalProfit, deliveryRate };
}
