/**
 * lib/returns/queries.ts
 */
import { createClient } from "@/lib/supabase/server";
import type { Return, ReturnItem } from "@/types/scanner";

export async function getReturns(limit = 100) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("returns")
    .select(`
      id, return_number, order_id, reason, condition, status,
      refund_amount, carrier_cost, write_off_amount,
      total_loss_mad, claim_amount_mad,
      received_at, inspected_at, inspection_notes, created_at
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const returns = data as unknown as Return[];
  const orderIds = returns.map((r) => r.order_id);

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, customer_name")
    .in("id", orderIds);

  const orderMap: Record<string, { order_number: string; customer_name: string }> = {};
  for (const o of (orders ?? []) as unknown as { id: string; order_number: string; customer_name: string }[]) {
    orderMap[o.id] = o;
  }

  return returns.map((r) => ({
    ...r,
    order_number:  orderMap[r.order_id]?.order_number  ?? null,
    customer_name: orderMap[r.order_id]?.customer_name ?? null,
  }));
}

export async function getReturn(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("returns")
    .select(`
      id, return_number, order_id, reason, condition, status,
      refund_amount, carrier_cost, write_off_amount,
      total_loss_mad, claim_amount_mad,
      received_at, inspected_at, inspection_notes, created_at
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;

  const ret = data as unknown as Return;

  const { data: items } = await supabase
    .from("return_items")
    .select(`
      id, return_id, order_item_id, product_id,
      quantity, condition, returned_qty, good_qty, damaged_qty,
      missing_qty, restocked_qty, unit_cost_mad, write_off_value,
      restocked, notes, created_at
    `)
    .eq("return_id", id);

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, customer_city, total_amount_mad")
    .eq("id", ret.order_id)
    .single();

  // Fetch product names for items
  const productIds = [...new Set((items ?? []).map((i: unknown) => (i as { product_id: string }).product_id))];
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku")
    .in("id", productIds);

  const productMap: Record<string, { name: string; sku: string }> = {};
  for (const p of (products ?? []) as unknown as { id: string; name: string; sku: string }[]) {
    productMap[p.id] = p;
  }

  const enrichedItems = ((items ?? []) as unknown as ReturnItem[]).map((item) => ({
    ...item,
    product_name: productMap[item.product_id]?.name ?? "",
    product_sku:  productMap[item.product_id]?.sku  ?? "",
  }));

  return {
    ...ret,
    order_number:  (order as unknown as { order_number: string })?.order_number  ?? null,
    customer_name: (order as unknown as { customer_name: string })?.customer_name ?? null,
    customer_phone:(order as unknown as { customer_phone: string })?.customer_phone ?? null,
    customer_city: (order as unknown as { customer_city: string })?.customer_city  ?? null,
    total_amount_mad: (order as unknown as { total_amount_mad: number })?.total_amount_mad ?? 0,
    items: enrichedItems,
  };
}

export async function getReturnsSummary() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("returns")
    .select("id, condition, status, total_loss_mad, claim_amount_mad");

  const rows = (data ?? []) as { id: string; condition: string; status: string; total_loss_mad: number | null; claim_amount_mad: number | null }[];

  return {
    total:       rows.length,
    good:        rows.filter((r) => r.condition === "good").length,
    damaged:     rows.filter((r) => r.condition === "damaged").length,
    lost:        rows.filter((r) => r.condition === "lost").length,
    totalLoss:   rows.reduce((s, r) => s + (r.total_loss_mad ?? 0), 0),
    totalClaim:  rows.reduce((s, r) => s + (r.claim_amount_mad ?? 0), 0),
  };
}
