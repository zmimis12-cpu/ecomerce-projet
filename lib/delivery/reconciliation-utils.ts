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

/**
 * Le rapport "Cash Paid" de Digylog n'est PAS un vrai CSV ni un vrai Excel —
 * c'est un tableau JSON brut sans en-têtes, colonnes identifiées uniquement
 * par leur position (juste renommé .xlsx/.csv par erreur côté Digylog).
 * Format confirmé par un vrai export: 21 colonnes par ligne, ex:
 * ["467499","01/07/2026","26/06/2026","HajtekZone","SA80030AG","HC-01209",
 *  "499.00","Guercif","حسن. التازي","0670129676","ليراك","-","Livraison",
 *  "1","35.00","35.00","Port dû","35.00","499.00",464,"Versés"]
 */
function parseDigylogCashPaidJson(text: string): DigylogInvoiceRow[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const rows: DigylogInvoiceRow[] = [];
  for (const line of data) {
    if (!Array.isArray(line) || line.length < 21) continue;
    const tracking = String(line[4] ?? "").trim();
    if (!tracking) continue;

    const cod    = parseFloat(String(line[6] ?? "0").replace(",", ".")) || 0;
    const fee    = parseFloat(String(line[14] ?? "0").replace(",", ".")) || 0;
    const netPaid = typeof line[19] === "number" ? line[19] : parseFloat(String(line[19] ?? "0").replace(",", ".")) || 0;

    rows.push({
      tracking_number: tracking.toUpperCase(),
      invoice_status:  String(line[20] ?? "").trim() || "livré",
      cod_amount:      cod,
      delivery_fee:    fee,
      return_fee:      0,
      amount_paid:     netPaid,
      order_number:    String(line[5] ?? "").trim() || undefined,
      city:            String(line[7] ?? "").trim() || undefined,
    });
  }
  return rows;
}

const CASH_PAID_STATUS_WORDS = ["Versés", "Révoquée", "En cours de versement"];

/**
 * Repli robuste quand le JSON n'est pas strictement valide — ce qui arrive
 * souvent quand le fichier Digylog est passé par Excel/Sheets avant d'être
 * copié-collé (échappement CSV appliqué par-dessus le JSON, guillemets
 * doublés, parfois une ligne entière transformée en objet {"0":...} au lieu
 * d'un tableau). On extrait les valeurs par position RELATIVE au numéro de
 * tracking et au mot de statut plutôt que par un parsing JSON strict, ce qui
 * tolère ce genre de corruption sans perdre de lignes.
 */
function parseDigylogCashPaidResilient(rawText: string): DigylogInvoiceRow[] {
  let text = rawText;
  text = text.replace(/\\\//g, "/");
  text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  text = text.replace(/"{2,}/g, "\"");
  text = text.replace(/[[\]{}]/g, "");

  let tokens = text.split(/","/).map((t) => t.replace(/^"|"$/g, "").trim());
  tokens = tokens.map((t) => t.replace(/^\d{1,2}:/, "").replace(/"/g, "").trim());

  const trackIndices: number[] = [];
  tokens.forEach((t, i) => { if (/^S[A-Z0-9]{6,10}$/.test(t)) trackIndices.push(i); });

  const rows: DigylogInvoiceRow[] = [];
  for (let k = 0; k < trackIndices.length; k++) {
    const start = trackIndices[k];
    const end = k + 1 < trackIndices.length ? trackIndices[k + 1] : tokens.length;
    const window = tokens.slice(start, end);
    const tracking = window[0];

    let orderIdx = -1;
    let orderNumber = "";
    for (let i = 1; i <= 2 && i < window.length; i++) {
      if (/^HC-?\d+$/i.test(window[i]) || /^\d{7,}$/.test(window[i])) {
        orderIdx = i; orderNumber = window[i]; break;
      }
    }

    const statusIdx = window.findIndex((t) => CASH_PAID_STATUS_WORDS.includes(t));

    let codAmount = 0;
    if (orderIdx >= 0) {
      for (let i = orderIdx + 1; i < window.length; i++) {
        if (/^-?\d+(\.\d+)?$/.test(window[i])) { codAmount = parseFloat(window[i]); break; }
      }
    }
    let netPaid = 0;
    if (statusIdx > 0) {
      for (let i = statusIdx - 1; i >= 0; i--) {
        if (/^-?\d+(\.\d+)?$/.test(window[i])) { netPaid = parseFloat(window[i]); break; }
      }
    }

    rows.push({
      tracking_number: tracking.toUpperCase(),
      invoice_status:  window[statusIdx] || "livré",
      cod_amount:      codAmount,
      delivery_fee:    Math.max(0, codAmount - netPaid),
      return_fee:      0,
      amount_paid:     netPaid,
      order_number:    orderNumber || undefined,
    });
  }
  return rows;
}

export function parseDigylogCsv(csvText: string): DigylogInvoiceRow[] {
  // Auto-détection: si le contenu commence par "[" c'est le format JSON
  // "Cash Paid" de Digylog, pas un vrai CSV — on route vers le bon parser.
  const trimmed = csvText.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("\"[") || trimmed.startsWith("\"\"[")) {
    const strict = parseDigylogCashPaidJson(trimmed);
    // Si le JSON strict échoue (0 ligne alors qu'il y a du contenu — signe
    // d'un fichier corrompu par un passage dans Excel), on retombe sur le
    // parseur tolérant plutôt que d'afficher "aucune ligne détectée".
    if (strict.length > 0) return strict;
    return parseDigylogCashPaidResilient(trimmed);
  }

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


