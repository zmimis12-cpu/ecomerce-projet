/**
 * lib/delivery/digylog/status-map.ts
 * Maps Digylog idStatus → internal order status.
 * Based on real statuses from GET /statuses (your account).
 */

export type DigylogInternalStatus =
  | "not_sent" | "in_transit" | "delivered" | "paid"
  | "returned" | "refused_delivery" | "cancelled" | "lost"
  | "damaged" | "postponed" | "unknown";

// Map idStatus → internal (based on your real Digylog statuses)
export const ID_STATUS_MAP: Record<number, DigylogInternalStatus> = {
  0:  "not_sent",          // Non envoyée
  1:  "in_transit",        // En cours de réception au hub de livraison
  2:  "in_transit",        // Reçu
  3:  "in_transit",        // En cours de livraison
  4:  "in_transit",        // Injoignable
  5:  "postponed",         // Reportée
  6:  "delivered",         // Livrée
  7:  "cancelled",         // Annulée
  8:  "returned",          // Retournée
  9:  "refused_delivery",  // Refusée
  10: "returned",          // En cours de réception au hub de retour
  11: "returned",          // Au hub de retour
  13: "cancelled",         // Supprimée
  14: "in_transit",        // En cours de dispatch
  15: "in_transit",        // Récupérée
  16: "in_transit",        // En cours de réception au network
  17: "in_transit",        // Au hub network
  18: "postponed",         // Programmée
  19: "in_transit",        // En cours d'expédition
  30: "returned",          // En cours d'expédition au hub de retour
  31: "in_transit",        // En cours d'expédition au network
  32: "returned",          // En cours de transfert de hub de retour
  38: "not_sent",          // Blocage d'envoi
  39: "in_transit",        // En cours d'expédition depuis FC
  40: "returned",          // En cours de préparation de retour
  41: "returned",          // En cours de retour au FC
  42: "in_transit",        // En cours de réception au FC
  43: "in_transit",        // Injoignable *
  44: "postponed",         // Reportée *
  45: "delivered",         // Livrée *  ← important
  46: "cancelled",         // Annulée *
  47: "refused_delivery",  // Refusée *
  48: "cancelled",         // Remboursement Annulé
  49: "in_transit",        // En cours de préparation en FC
  50: "in_transit",        // En cours de réception au network - BTN
  51: "not_sent",          // Non Reçu
  52: "cancelled",         // Annulée par FC
  53: "in_transit",        // En cours de transfert de hub de livraison
  54: "in_transit",        // En cours de réception au hub - BTH
  55: "in_transit",        // Adresse inconnue
  64: "in_transit",        // Numéro incorrect
  65: "in_transit",        // Numéro incorrect *
  66: "refused_delivery",  // Client suspect
  67: "refused_delivery",  // Client suspect *
  70: "in_transit",        // Ville incorrecte
  71: "in_transit",        // Ville incorrecte *
  72: "in_transit",        // Rappel en cours *
  73: "in_transit",        // Confirmé par livreur *
  74: "refused_delivery",  // Client incorrect *
  75: "refused_delivery",  // Client incorrect
  76: "in_transit",
  77: "in_transit",
  78: "returned",
  79: "returned",
};

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
  let internal: DigylogInternalStatus = "unknown";

  if (idStatus !== null && idStatus !== undefined && ID_STATUS_MAP[idStatus] !== undefined) {
    internal = ID_STATUS_MAP[idStatus];
  } else {
    // Label fallback
    const l = label.toLowerCase();
    if (/vers[eé]/i.test(l))            internal = "paid";     // Versés = payé
    else if (/livr[eé]/i.test(l))      internal = "delivered";
    else if (/pay[eé]/i.test(l))        internal = "paid";
    else if (/retour/i.test(l))         internal = "returned";
    else if (/refus/i.test(l))          internal = "refused_delivery";
    else if (/annul/i.test(l))          internal = "cancelled";
    else if (/report|program/i.test(l)) internal = "postponed";
    else if (/cours|reçu|transit|hub|dispatch|expéd/i.test(l)) internal = "in_transit";
  }

  const ORDER_STATUS: Record<DigylogInternalStatus, string> = {
    not_sent:         "not_sent",          // Still in Digylog "Non envoyées" — not picked up yet
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
    orderStatus:  ORDER_STATUS[internal] ?? "in_transit",
    isPaid:       internal === "paid",
    isDelivered:  internal === "delivered" || internal === "paid",
    isReturned:   ["returned","refused_delivery","lost","damaged"].includes(internal),
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
