/**
 * lib/orders/queries.ts — Optimised queries
 * Key changes:
 * - Default limit 200 (was 500)
 * - Items list fetches only 3 fields needed for display
 * - Orders + agents fetched in parallel
 * - getOrder detail fetches all 3 sub-queries in parallel (unchanged)
 */
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderListItem, OrderStatus } from "@/types/orders";

const ORDER_LIST_FIELDS = `
  id, order_number, customer_name, customer_phone, customer_city,
  status, total_amount_mad, estimated_profit, assigned_to,
  source, notes, delivery_tracking_number, is_duplicate, duplicate_of, created_at
`;

const ORDER_DETAIL_FIELDS = `
  id, order_number, customer_name, customer_phone, customer_address,
  customer_city, customer_region, customer_country,
  subtotal, discount_amount, shipping_charge, total_amount,
  total_amount_mad, amount_collected, estimated_profit,
  status, payment_status, payment_method,
  assigned_to, confirmed_by, confirmed_at,
  notes, internal_notes, delivery_tracking_number, sync_error, import_source,
  source, is_duplicate, duplicate_of, created_at, updated_at
`;

export interface OrderFilters {
  status?: OrderStatus | "all";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  assignedTo?: string;
}

export async function getOrders(
  filters: OrderFilters = {},
  isAgent = false,
  agentId?: string,
  limit = 200
): Promise<OrderListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(ORDER_LIST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (isAgent && agentId) query = query.eq("assigned_to", agentId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.search) {
    query = query.or(
      `customer_name.ilike.%${filters.search}%,customer_phone.ilike.%${filters.search}%,order_number.ilike.%${filters.search}%`
    );
  }
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo)   query = query.lte("created_at", filters.dateTo + "T23:59:59");

  const { data, error } = await query;

  if (error) {
    console.error("[orders] getOrders error:", error.message);
    return [];
  }

  const orders = (data ?? []) as unknown as Order[];
  if (orders.length === 0) return [];

  const orderIds  = orders.map((o) => o.id);
  const agentIds  = [...new Set(orders.map((o) => o.assigned_to).filter(Boolean))] as string[];

  // Parallel fetch: items (3 fields only) + agents
  const [itemsRes, agentsRes] = await Promise.all([
    supabase
      .from("order_items")
      .select("order_id, product_name, product_sku")
      .in("order_id", orderIds),
    agentIds.length > 0
      ? supabase.from("users").select("id, full_name").in("id", agentIds)
      : { data: [] },
  ]);

  // Build lookup maps
  const itemsByOrder: Record<string, { product_name: string; product_sku: string }[]> = {};
  for (const item of (itemsRes.data ?? []) as unknown as { order_id: string; product_name: string; product_sku: string }[]) {
    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
    itemsByOrder[item.order_id].push(item);
  }

  const agentMap: Record<string, string> = {};
  for (const a of (agentsRes.data ?? []) as unknown as { id: string; full_name: string }[]) {
    agentMap[a.id] = a.full_name;
  }

  return orders.map((o) => {
    const items = itemsByOrder[o.id] ?? [];
    return {
      id: o.id,
      order_number: o.order_number,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      customer_city: o.customer_city,
      status: o.status,
      total_amount_mad: o.total_amount_mad ?? 0,
      estimated_profit: o.estimated_profit ?? null,
      assigned_to: o.assigned_to,
      agent_name: o.assigned_to ? (agentMap[o.assigned_to] ?? null) : null,
      item_count: items.length,
      first_product_name: items[0]?.product_name ?? null,
      first_product_sku: items[0]?.product_sku ?? null,
      source: o.source,
      notes: o.notes,
      delivery_tracking_number: o.delivery_tracking_number,
      is_duplicate: o.is_duplicate ?? false,
      duplicate_of: o.duplicate_of ?? null,
      created_at: o.created_at,
    } as OrderListItem;
  });
}

export async function getOrder(id: string): Promise<Order | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_DETAIL_FIELDS)
    .eq("id", id)
    .single();

  if (error || !data) {
    console.error("[orders] getOrder error:", error?.message);
    return null;
  }

  const order = data as unknown as Order;

  const [itemsRes, historyRes, agentRes] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, order_id, product_id, product_name, product_sku, unit_price, unit_cost_mad, quantity, discount_pct, line_total, line_cogs, line_gross_profit, created_at")
      .eq("order_id", id)
      .order("created_at"),
    supabase
      .from("order_status_history")
      .select("id, order_id, from_status, to_status, changed_by, notes, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(50),                                       // cap history at 50 rows
    order.assigned_to
      ? supabase.from("users").select("id, full_name, email").eq("id", order.assigned_to).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    ...order,
    items: (itemsRes.data ?? []) as unknown as Order["items"],
    status_history: (historyRes.data ?? []) as unknown as Order["status_history"],
    agent: agentRes.data as Order["agent"],
  };
}

export async function getAgents() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, full_name, email, role")
    .in("role", ["super_admin", "admin", "manager", "call_center_agent"])
    .eq("is_active", true)
    .order("full_name");
  return (data ?? []) as unknown as { id: string; full_name: string; email: string; role: string }[];
}
