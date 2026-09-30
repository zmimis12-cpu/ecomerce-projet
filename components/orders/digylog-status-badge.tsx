/**
 * Badge du statut EXACT Digylog (même libellé et mêmes couleurs que leur panel),
 * affiché à côté du statut du système. + date de report + téléphone livreur.
 */
const RED    = "bg-red-600 text-white";
const GREEN  = "bg-green-700 text-white";
const ORANGE = "bg-orange-500 text-white";
const YELLOW = "bg-amber-400 text-black";
const BLUE   = "bg-blue-600 text-white";
const GREY   = "bg-gray-400 text-white";
const PURPLE = "bg-purple-600 text-white";

// idStatus Digylog → couleur (proche du panel seller.digylog.com)
const COLOR: Record<number, string> = {
  0: GREY, 38: GREY, 51: GREY,                            // Non envoyée / Blocage / Non reçu
  1: BLUE, 2: BLUE, 16: BLUE, 17: BLUE, 42: BLUE, 49: BLUE, 50: BLUE, 54: BLUE, // hub / réception
  14: YELLOW, 19: YELLOW, 31: YELLOW, 39: YELLOW, 53: YELLOW, 15: YELLOW,       // expédition / dispatch
  3: PURPLE,                                              // En cours de livraison
  73: GREEN, 72: GREEN,                                   // Confirmé par livreur / rappel
  6: GREEN, 45: GREEN,                                    // Livrée
  5: ORANGE, 44: ORANGE, 18: ORANGE,                      // Reportée / Programmée
  4: ORANGE, 43: ORANGE, 55: ORANGE, 64: ORANGE, 65: ORANGE, 70: ORANGE, 71: ORANGE, // Injoignable / adresse / numéro / ville
  7: RED, 13: RED, 46: RED, 48: RED, 52: RED,             // Annulée / Supprimée
  8: RED, 10: RED, 11: RED, 30: RED, 32: RED, 40: RED, 41: RED, 78: RED, 79: RED, // Retour
  9: RED, 47: RED, 66: RED, 67: RED, 74: RED, 75: RED,    // Refusée / suspect / incorrect
};

function colorFor(id: number | null | undefined, label: string) {
  if (id != null && COLOR[id]) return COLOR[id];
  const l = label.toLowerCase();
  if (l.includes("livrée")) return GREEN;
  if (l.includes("report") || l.includes("programm") || l.includes("injoignable")) return ORANGE;
  if (l.includes("retour") || l.includes("refus") || l.includes("annul") || l.includes("supprim")) return RED;
  if (l.includes("expédition") || l.includes("dispatch")) return YELLOW;
  if (l.includes("hub") || l.includes("réception")) return BLUE;
  return GREY;
}

export function DigylogStatusBadge({
  label, id, reportedTo, driverPhone, compact = false,
}: {
  label: string | null | undefined;
  id?: number | null;
  reportedTo?: string | null;
  driverPhone?: string | null;
  compact?: boolean;
}) {
  if (!label) return null;
  const isReport = /report|programm/i.test(label);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${colorFor(id, label)}`}
        title="Statut Digylog (identique au panel Digylog)"
      >
        <span className="opacity-80">DG</span> {label}
      </span>
      {isReport && reportedTo && (
        <span className="text-[10px] font-medium text-orange-700">
          → {new Date(reportedTo).toLocaleDateString("fr-FR", { timeZone: "Africa/Casablanca" })}
        </span>
      )}
      {!compact && driverPhone && (
        <a href={`tel:${driverPhone}`} className="text-[10px] text-primary hover:underline">🛵 {driverPhone}</a>
      )}
    </div>
  );
}
