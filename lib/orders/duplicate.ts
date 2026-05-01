/**
 * lib/orders/duplicate.ts
 * App-level duplicate detection: same phone + same product + last 24h.
 * Runs before order insert so we can pass is_duplicate=true explicitly.
 */
import { createClient } from "@/lib/supabase/server";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingOrderId: string | null;
  existingOrderNumber: string | null;
}

export async function checkOrderDuplicate(
  customerPhone: string,
  productId: string
): Promise<DuplicateCheckResult> {
  const supabase = await createClient();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find recent orders with same phone
  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("customer_phone", customerPhone)
    .not("status", "in", '("cancelled","returned")')
    .gte("created_at", since)
    .limit(10);

  if (!recentOrders || recentOrders.length === 0) {
    return { isDuplicate: false, existingOrderId: null, existingOrderNumber: null };
  }

  const orderIds = (recentOrders as { id: string; order_number: string }[]).map((o) => o.id);

  // Check if any of those orders contain the same product
  const { data: matchingItems } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("product_id", productId)
    .in("order_id", orderIds)
    .limit(1);

  if (!matchingItems || matchingItems.length === 0) {
    return { isDuplicate: false, existingOrderId: null, existingOrderNumber: null };
  }

  const matchedOrderId = (matchingItems[0] as { order_id: string }).order_id;
  const matchedOrder = (recentOrders as { id: string; order_number: string }[])
    .find((o) => o.id === matchedOrderId);

  return {
    isDuplicate: true,
    existingOrderId: matchedOrderId,
    existingOrderNumber: matchedOrder?.order_number ?? null,
  };
}
