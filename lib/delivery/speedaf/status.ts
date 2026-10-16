/**
 * Statuts Speedaf (action / sous-code) → statut interne (mêmes valeurs que Digylog).
 *  1 Pick Up · 2 Départ site/DC · 3 Arrivée DC · 4 En livraison · 5 Livré
 *  -710 Retour en cours · 730 Retour signé · IPxx = colis à problème (refus, injoignable…)
 */
import type { DigylogInternalStatus } from "@/lib/delivery/digylog/status-map";

export type SpeedafMapped = {
  internal: DigylogInternalStatus;
  orderStatus: string;
  label: string;
  isDelivered: boolean;
  isReturned: boolean;
  isFinal: boolean;
};

const ORDER_STATUS: Record<DigylogInternalStatus, string> = {
  not_sent: "sent_to_delivery", in_transit: "in_transit", delivered: "delivered", paid: "paid",
  returned: "returned", refused_delivery: "refused_delivery", cancelled: "cancelled",
  lost: "returned", damaged: "returned", postponed: "in_transit", unknown: "in_transit",
};

const PROBLEM_LABELS: Record<string, string> = {
  IP01: "Injoignable", IP02: "Adresse incomplète", IP03: "Adresse modifiée", IP04: "Hors zone de livraison",
  IP05: "Refusé par le client", IP06: "Reporté par le client", IP07: "Mal trié", IP08: "Retrait en agence",
  IP09: "Retour demandé", IP10: "Commande en double", IP11: "Colis perdu", IP12: "Colis endommagé",
  IP13: "Modification du bordereau", IP14: "Autre problème", IP16: "Paiement anticipé", "5573": "Force majeure",
};

export function mapSpeedafTrack(action: string, subAction?: string, actionName?: string): SpeedafMapped {
  const a = String(action ?? "").trim().toUpperCase();
  const sub = String(subAction ?? "").trim().toUpperCase();
  const code = a.startsWith("IP") ? a.slice(0, 4) : sub.startsWith("IP") ? sub.slice(0, 4) : a;
  let internal: DigylogInternalStatus = "in_transit";
  let label = actionName || "";

  switch (code) {
    case "1": internal = "in_transit"; label ||= "Ramassé"; break;
    case "2": internal = "in_transit"; label ||= "En route"; break;
    case "3": internal = "in_transit"; label ||= "Arrivé au centre"; break;
    case "4": internal = "in_transit"; label ||= "En cours de livraison"; break;
    case "5": internal = "delivered"; label ||= "Livré"; break;
    case "-710": internal = "returned"; label ||= "Retour en cours"; break;
    case "730": internal = "returned"; label ||= "Retour signé"; break;
    case "IP05": internal = "refused_delivery"; break;
    case "IP06": internal = "postponed"; break;
    case "IP09": internal = "returned"; break;
    case "IP11": internal = "lost"; break;
    case "IP12": internal = sub === "IP12-03" ? "in_transit" : "damaged"; break;
    case "CANCEL": internal = "cancelled"; label ||= "Annulé"; break;
    default: internal = "in_transit";
  }
  if (PROBLEM_LABELS[code]) label = actionName ? `${PROBLEM_LABELS[code]} — ${actionName}` : PROBLEM_LABELS[code];

  return {
    internal,
    orderStatus: ORDER_STATUS[internal] ?? "in_transit",
    label: label || code || "Speedaf",
    isDelivered: internal === "delivered",
    isReturned: ["returned", "refused_delivery", "lost", "damaged"].includes(internal),
    isFinal: ["delivered", "returned", "cancelled", "lost"].includes(internal),
  };
}
