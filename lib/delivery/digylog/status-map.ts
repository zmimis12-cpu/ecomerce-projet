/**
 * lib/delivery/digylog/status-map.ts
 * Maps Digylog status labels + idStatus → internal order status.
 * Based on real Digylog statuses from GET /statuses.
 */

// Internal status type
export type DigylogInternalStatus =
  | "not_sent" | "in_transit" | "delivered" | "paid"
  | "returned" | "refused_delivery" | "cancelled" | "lost"
  | "damaged" | "postponed" | "unknown";

// Map by idStatus (most reliable)
export const ID_STATUS_MAP: Record<number, DigylogInternalStatus> = {
  0:  "not_sent",
  1:  "in_transit",
  2:  "in_transit",
  3:  "in_transit",
  4:  "in_transit",
  5:  "postponed",
  6:  "delivered",
  7:  "paid",
  8:  "returned",
  9:  "refused_delivery",
  10: "cancelled",
  11: "lost",
  12: "damaged",
  13: "in_transit",
  14: "in_transit",
  15: "in_transit",
  16: "in_transit",
  17: "in_transit",
  18: "postponed",
  44: "postponed",
};

// Map by label (fallback, case-insensitive substring match)
const LABEL_RULES: { pattern: RegExp; status: DigylogInternalStatus }[] = [
  { pattern: /non envoy/i,             status: "not_sent" },
  { pattern: /en cours/i,              status: "in_transit" },
  { pattern: /transit/i,               status: "in_transit" },
  { pattern: /ramassage/i,             status: "in_transit" },
  { pattern: /livr[eé]e?$/i,           status: "delivered" },
  { pattern: /delivered$/i,            status: "delivered" },
  { pattern: /pay[eé]/i,               status: "paid" },
  { pattern: /paid/i,                  status: "paid" },
  { pattern: /retour/i,                status: "returned" },
  { pattern: /returned/i,              status: "returned" },
  { pattern: /refus/i,                 status: "refused_delivery" },
  { pattern: /annul/i,                 status: "cancelled" },
  { pattern: /perdu/i,                 status: "lost" },
  { pattern: /lost/i,                  status: "lost" },
  { pattern: /endommagé/i,             status: "damaged" },
  { pattern: /damaged/i,               status: "damaged" },
  { pattern: /report/i,                status: "postponed" },
  { pattern: /postpone/i,              status: "postponed" },
];

export function mapDigylogStatus(
  idStatus: number | null | undefined,
  label: string
): {
  internal:    DigylogInternalStatus;
  orderStatus: string;
  isPaid:      boolean;
  isDelivered: boolean;
  isReturned:  boolean;
} {
  // 1. Try idStatus first (most precise)
  let internal: DigylogInternalStatus = "unknown";

  if (idStatus !== null && idStatus !== undefined && ID_STATUS_MAP[idStatus]) {
    internal = ID_STATUS_MAP[idStatus];
  } else {
    // 2. Fall back to label matching
    for (const rule of LABEL_RULES) {
      if (rule.pattern.test(label)) {
        internal = rule.status;
        break;
      }
    }
  }

  // Map internal → order table status
  const ORDER_STATUS_MAP: Record<DigylogInternalStatus, string> = {
    not_sent:         "confirmed",
    in_transit:       "in_transit",
    delivered:        "delivered",
    paid:             "paid",
    returned:         "returned",
    refused_delivery: "refused_delivery",
    cancelled:        "cancelled",
    lost:             "returned",
    damaged:          "returned",
    postponed:        "in_transit",
    unknown:          "in_transit",
  };

  return {
    internal,
    orderStatus:  ORDER_STATUS_MAP[internal] ?? "in_transit",
    isPaid:       internal === "paid",
    isDelivered:  internal === "delivered" || internal === "paid",
    isReturned:   ["returned","lost","damaged","refused_delivery"].includes(internal),
  };
}

export const INTERNAL_STATUS_LABELS: Record<DigylogInternalStatus, string> = {
  not_sent:         "Non envoyé",
  in_transit:       "En transit",
  delivered:        "Livré",
  paid:             "Livré & Payé",
  returned:         "Retourné",
  refused_delivery: "Refusé",
  cancelled:        "Annulé",
  lost:             "Perdu",
  damaged:          "Endommagé",
  postponed:        "Reporté",
  unknown:          "Inconnu",
};
