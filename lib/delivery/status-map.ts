/**
 * lib/delivery/status-map.ts
 * Maps external delivery company statuses to internal order statuses.
 */

// External → internal status mapping
export const STATUS_MAP: Record<string, string> = {
  // French variants
  "colis reçu":               "picked_up",
  "reçu":                     "picked_up",
  "non reçu":                 "not_received",
  "en cours de livraison":    "in_transit",
  "en transit":               "in_transit",
  "en cours":                 "in_transit",
  "livré":                    "delivered",
  "livre":                    "delivered",
  "livré payé":               "paid",
  "livre paye":               "paid",
  "retour":                   "returned",
  "retourné":                 "returned",
  "refusé":                   "refused_delivery",
  "refuse":                   "refused_delivery",
  "refus":                    "refused_delivery",
  "annulé":                   "cancelled",
  "annule":                   "cancelled",
  "perdu":                    "lost",
  "endommagé":                "damaged",
  "endommage":                "damaged",
  // English variants
  "received":                 "picked_up",
  "picked_up":                "picked_up",
  "in_transit":               "in_transit",
  "out_for_delivery":         "in_transit",
  "delivered":                "delivered",
  "delivered_paid":           "paid",
  "returned":                 "returned",
  "refused":                  "refused_delivery",
  "cancelled":                "cancelled",
  "lost":                     "lost",
  "damaged":                  "damaged",
};

// Internal status → order table status
export const INTERNAL_TO_ORDER_STATUS: Record<string, string> = {
  picked_up:       "sent_to_delivery",
  not_received:    "sent_to_delivery",
  in_transit:      "in_transit",
  delivered:       "delivered",
  paid:            "paid",
  returned:        "returned",
  refused_delivery:"refused_delivery",
  cancelled:       "cancelled",
  lost:            "returned",   // treat lost as returned for financials
  damaged:         "returned",
};

export type InternalDeliveryStatus = keyof typeof INTERNAL_TO_ORDER_STATUS;

export function mapStatus(externalStatus: string): {
  internal: string;
  orderStatus: string;
  isPaid: boolean;
  isReturned: boolean;
  isDelivered: boolean;
} {
  const key      = externalStatus.toLowerCase().trim();
  const internal = STATUS_MAP[key] ?? "unknown";
  const orderStatus = INTERNAL_TO_ORDER_STATUS[internal] ?? "in_transit";

  return {
    internal,
    orderStatus,
    isPaid:      internal === "paid",
    isReturned:  ["returned","lost","damaged"].includes(internal),
    isDelivered: ["delivered","paid"].includes(internal),
  };
}

export const STATUS_LABELS: Record<string, string> = {
  picked_up:       "Colis reçu",
  not_received:    "Non reçu",
  in_transit:      "En transit",
  delivered:       "Livré",
  paid:            "Livré & Payé",
  returned:        "Retourné",
  refused_delivery:"Refusé",
  cancelled:       "Annulé",
  lost:            "Perdu",
  damaged:         "Endommagé",
  unknown:         "Inconnu",
};
