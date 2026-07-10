/**
 * lib/delivery/reconciliation-utils.ts
 * Pure utility functions (no server actions) — safe to import anywhere.
 */

const CASABLANCA_VARIANTS = [
  "casablanca", "casa", "الدار البيضاء", "dar el beida",
  "hay albaraka", "albaraka", "casablanca city", "casa blanc",
  "grand casablanca", "ain chock", "ain sebaa", "ben m'sik",
  "sidi bernoussi", "moulay rachid", "hay hassani", "bouchentouf",
];

export function normalizeCity(city: string): string {
  const lower = (city ?? "").toLowerCase().trim();
  if (CASABLANCA_VARIANTS.some((v) => lower.includes(v))) return "Casablanca";
  return (city ?? "").trim();
}

export function getExpectedDeliveryCost(city: string): number {
  return normalizeCity(city) === "Casablanca" ? 20 : 35;
}

export interface DigylogInvoiceRow {
  tracking_number:  string;
  invoice_status:   string;
  cod_amount:       number;
  delivery_fee:     number;
  return_fee:       number;
  amount_paid:      number;
  bl_number?:       string;
  order_number?:    string;
  city?:            string;
}

export function parseDigylogCsv(csvText: string): DigylogInvoiceRow[] {
  const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase()
    .replace(/['"]/g, "").replace(/\s+/g, "_"));

  const rows: DigylogInvoiceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/['"]/g, ""));
    const get  = (keys: string[]) => {
      for (const k of keys) {
        const idx = headers.findIndex((h) => h.includes(k));
        if (idx >= 0 && cols[idx]) return cols[idx];
      }
      return "";
    };
    const num  = (keys: string[]) => parseFloat(get(keys).replace(",", ".")) || 0;

    const tracking = get(["tracking", "traking", "bordereau", "code_suivi"]);
    if (!tracking) continue;

    rows.push({
      tracking_number: tracking.toUpperCase(),
      invoice_status:  get(["cash_status", "statut", "status", "etat", "état", "situation_cash"]) || "livré",
      cod_amount:      num(["price", "prix", "cod", "montant_cod", "montant_client", "recovered_amount"]),
      delivery_fee:    num(["fees", "u.p", "frais", "fee", "cout", "coût", "livraison_fee", "delivery"]),
      return_fee:      num(["retour", "return", "frais_retour"]),
      amount_paid:     num(["cash_paid", "payé", "paye", "net", "montant_net", "paiement", "paid"]),
      bl_number:       get(["invoice", "bl", "bon_livraison", "bl_number"]),
      order_number:    get(["order", "commande", "num_commande", "reference"]),
      city:            get(["city", "ville", "destination"]),
    });
  }

  return rows;
}


