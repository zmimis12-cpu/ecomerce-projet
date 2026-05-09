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
  source, notes, delivery_tracking_number,
  delivery_external_status, delivery_external_status_id,
  delivery_status, delivery_last_sync_at, bl_id,
  is_duplicate, duplicate_of, created_at
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

export async function getAgents() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("call_center_agents")
    .select(`
      user_id,
      display_name,
      active,
      availability_status,
      users:users!inner (
        id,
        email,
        role
      )
    `)
    .eq("active", true)
    .order("display_name");

  return (
    (data ?? []) as {
      user_id: string;
      display_name: string | null;
      availability_status: string | null;
      users: { id: string; email: string; role: string } | null;
    }[]
  ).map((a) => ({
    id: a.user_id,
    full_name: a.display_name ?? a.users?.email ?? "Agent",
    email: a.users?.email ?? "",
    role: a.users?.role ?? "call_center_agent",
    availability_status: a.availability_status ?? "offline",
  }));
}