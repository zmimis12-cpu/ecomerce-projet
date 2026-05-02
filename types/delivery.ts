/**
 * types/delivery.ts
 */

export type DeliveryStatus =
  | "sent_to_delivery"
  | "in_transit"
  | "delivered"
  | "refused_delivery"
  | "returned";

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "sent_to_delivery",
  "in_transit",
  "delivered",
  "refused_delivery",
  "returned",
];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  sent_to_delivery: "Envoyé en livraison",
  in_transit:       "En transit",
  delivered:        "Livré",
  refused_delivery: "Refusé à la livraison",
  returned:         "Retourné",
};

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, { bg: string; text: string; dot: string }> = {
  sent_to_delivery: { bg: "bg-indigo-50",  text: "text-indigo-700",  dot: "bg-indigo-500" },
  in_transit:       { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  delivered:        { bg: "bg-teal-50",    text: "text-teal-700",    dot: "bg-teal-500" },
  refused_delivery: { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
  returned:         { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
};

// Allowed next statuses from each delivery status
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  sent_to_delivery: ["in_transit", "refused_delivery", "returned"],
  in_transit:       ["delivered",  "refused_delivery", "returned"],
  delivered:        [],
  refused_delivery: ["returned"],
  returned:         [],
};

export const DELIVERY_COMPANIES = [
  "DIGYLOG",
  "Amana",
  "Laposte MA",
  "Chronopost MA",
  "Autre",
] as const;

export interface DeliveryOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_city: string;
  status: string;
  delivery_status: DeliveryStatus | null;
  delivery_tracking_number: string | null;
  delivery_company: string | null;
  delivery_cost_real_mad: number;
  return_cost_mad: number;
  sent_to_delivery_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  is_paid: boolean;
  paid_at: string | null;
  total_amount_mad: number;
  estimated_profit: number | null;
  real_profit_mad: number | null;
  first_product_name: string | null;
  created_at: string;
}

/** Delivery timeline step */
export interface TimelineStep {
  key: string;
  label: string;
  date: string | null;
  done: boolean;
  current: boolean;
}

export function buildTimeline(order: {
  status: string;
  confirmed_at?: string | null;
  sent_to_delivery_at?: string | null;
  delivered_at?: string | null;
  paid_at?: string | null;
  returned_at?: string | null;
  created_at: string;
}): TimelineStep[] {
  const currentStatus = order.status;

  const steps: { key: string; label: string; date: string | null }[] = [
    { key: "new",              label: "Commande créée",       date: order.created_at },
    { key: "confirmed",        label: "Confirmée",            date: order.confirmed_at ?? null },
    { key: "sent_to_delivery", label: "Envoyée en livraison", date: order.sent_to_delivery_at ?? null },
    { key: "in_transit",       label: "En transit",           date: null },
    { key: "delivered",        label: "Livrée",               date: order.delivered_at ?? null },
    { key: "paid",             label: "Payée (COD encaissé)",  date: order.paid_at ?? null },
  ];

  const statusOrder = ["new","confirmed","sent_to_delivery","in_transit","delivered","paid","returned"];
  const currentIdx  = statusOrder.indexOf(currentStatus);

  return steps.map((step, idx) => ({
    ...step,
    done:    idx < currentIdx || (step.key === currentStatus),
    current: step.key === currentStatus,
  }));
}

export function formatMAD(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("fr-MA", {
    style: "currency", currency: "MAD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(val);
}
