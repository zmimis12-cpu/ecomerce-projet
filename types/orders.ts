/**
 * types/orders.ts — Order domain types
 */

export type OrderStatus =
  | "new"
  | "confirmed"
  | "refused"
  | "no_answer"
  | "processing"
  | "sent_to_delivery"
  | "delivered"
  | "paid"
  | "returned"
  | "cancelled"
  | "pending"
  | "shipped"
  | "partially_returned";

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_price: number;
  unit_cost_mad: number;
  quantity: number;
  discount_pct: number;
  line_total: number;
  line_cogs: number;
  line_gross_profit: number;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;

  // Customer snapshot
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_city: string;
  customer_region: string | null;
  customer_country: string;

  // Financials
  subtotal: number;
  discount_amount: number;
  shipping_charge: number;
  total_amount: number;
  total_amount_mad: number;
  amount_collected: number;
  estimated_profit: number | null;

  // Status
  status: OrderStatus;
  payment_status: string;
  payment_method: string;

  // Assignment
  assigned_to: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;

  // Google Sheet compat
  notes: string | null;
  internal_notes: string | null;
  delivery_tracking_number: string | null;
  sync_error: string | null;
  import_source: string | null;

  // Source
  source: string | null;

  // Duplicate detection
  is_duplicate: boolean;
  duplicate_of: string | null;

  created_at: string;
  updated_at: string;

  // Joined
  items?: OrderItem[];
  agent?: { id: string; full_name: string; email: string } | null;
  status_history?: OrderStatusHistory[];
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
  changer?: { full_name: string } | null;
}

export interface OrderListItem {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  status: OrderStatus;
  total_amount_mad: number;
  estimated_profit: number | null;
  assigned_to: string | null;
  agent_name: string | null;
  item_count: number;
  first_product_name: string | null;
  first_product_sku: string | null;
  source: string | null;
  notes: string | null;
  delivery_tracking_number: string | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
  created_at: string;
}

// ─── Status config ─────────────────────────────────────────────────────────────

export const ORDER_STATUSES: OrderStatus[] = [
  "new", "confirmed", "refused", "no_answer",
  "sent_to_delivery", "delivered", "paid",
  "returned", "cancelled",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new:              "Nouveau",
  confirmed:        "Confirmé",
  refused:          "Refusé",
  no_answer:        "Sans réponse",
  processing:       "En traitement",
  sent_to_delivery: "Envoyé en livraison",
  delivered:        "Livré",
  paid:             "Payé",
  returned:         "Retourné",
  cancelled:        "Annulé",
  pending:          "En attente",
  shipped:          "Expédié",
  partially_returned: "Partiellement retourné",
};

export const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; dot: string }> = {
  new:              { bg: "bg-blue-50",   text: "text-blue-700",  dot: "bg-blue-500" },
  confirmed:        { bg: "bg-green-50",  text: "text-green-700", dot: "bg-green-500" },
  refused:          { bg: "bg-red-50",    text: "text-red-700",   dot: "bg-red-500" },
  no_answer:        { bg: "bg-orange-50", text: "text-orange-700",dot: "bg-orange-400" },
  processing:       { bg: "bg-purple-50", text: "text-purple-700",dot: "bg-purple-500" },
  sent_to_delivery: { bg: "bg-indigo-50", text: "text-indigo-700",dot: "bg-indigo-500" },
  delivered:        { bg: "bg-teal-50",   text: "text-teal-700",  dot: "bg-teal-500" },
  paid:             { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500" },
  returned:         { bg: "bg-amber-50",  text: "text-amber-700", dot: "bg-amber-500" },
  cancelled:        { bg: "bg-slate-100", text: "text-slate-500", dot: "bg-slate-400" },
  pending:          { bg: "bg-slate-50",  text: "text-slate-600", dot: "bg-slate-400" },
  shipped:          { bg: "bg-cyan-50",   text: "text-cyan-700",  dot: "bg-cyan-500" },
  partially_returned:{ bg:"bg-amber-50",  text: "text-amber-700", dot: "bg-amber-400" },
};

// Which statuses a call_center_agent can set
export const AGENT_ALLOWED_STATUSES: OrderStatus[] = [
  "confirmed", "refused", "no_answer",
];

// Allowed transitions from each status (for validation)
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new:              ["confirmed", "refused", "no_answer", "cancelled"],
  confirmed:        ["sent_to_delivery", "cancelled", "refused"],
  refused:          ["new", "cancelled"],
  no_answer:        ["confirmed", "refused", "cancelled"],
  processing:       ["sent_to_delivery", "cancelled"],
  sent_to_delivery: ["delivered", "returned", "cancelled"],
  delivered:        ["paid", "returned"],
  paid:             [],
  returned:         [],
  cancelled:        [],
  pending:          ["confirmed", "cancelled"],
  shipped:          ["delivered", "returned"],
  partially_returned:["returned"],
};

export function formatOrderDate(dateStr: string): string {
  return new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(dateStr));
}
