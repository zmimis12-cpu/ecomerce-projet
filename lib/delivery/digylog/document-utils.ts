/**
 * lib/delivery/digylog/document-utils.ts
 * Pure utility functions — no server actions.
 */

export interface RawDocumentLine {
  tracking_number?:   string;
  cod_amount?:        number;
  delivery_fee?:      number;
  return_fee?:        number;
  payout_amount?:     number;
  city?:              string;
  status?:            string;
  raw_line_payload?:  Record<string, unknown>;
}

/**
 * Le rapport "Cash Paid" de Digylog n'est PAS un vrai CSV — c'est un tableau
 * JSON brut sans en-têtes, colonnes identifiées par position (voir
 * reconciliation-utils.ts pour l'explication complète et le format exact,
 * confirmé sur un vrai export: 21 colonnes, tracking en position 4, commande
 * en position 5, COD en position 6, frais en position 14, net en position
 * 19, statut en position 20).
 */
function parseCashPaidJson(text: string): RawDocumentLine[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const rows: RawDocumentLine[] = [];
  for (const line of data) {
    if (!Array.isArray(line) || line.length < 21) continue;
    const tracking = String(line[4] ?? "").trim();
    if (!tracking) continue;

    const cod    = parseFloat(String(line[6] ?? "0").replace(",", ".")) || 0;
    const fee    = parseFloat(String(line[14] ?? "0").replace(",", ".")) || 0;
    const net    = typeof line[19] === "number" ? line[19] : parseFloat(String(line[19] ?? "0").replace(",", ".")) || 0;

    rows.push({
      tracking_number:  tracking.toUpperCase(),
      cod_amount:       cod,
      delivery_fee:     fee,
      return_fee:       0,
      payout_amount:    net,
      city:             String(line[7] ?? "").trim(),
      status:           String(line[20] ?? "").trim(),
      raw_line_payload: { raw: line, order_number: String(line[5] ?? "").trim() },
    });
  }
  return rows;
}

const CASH_PAID_STATUS_WORDS = ["Versés", "Révoquée", "En cours de versement"];

/**
 * Repli robuste quand le JSON n'est pas strictement valide (fichier passé
 * par Excel avant collage: guillemets doublés, parfois une ligne entière
 * transformée en objet {"0":...} au lieu d'un tableau). Extraction par
 * position RELATIVE au tracking et au mot de statut — voir
 * reconciliation-utils.ts pour l'explication complète (même logique).
 */
function parseCashPaidResilient(rawText: string): RawDocumentLine[] {
  let text = rawText;
  text = text.replace(/\\\//g, "/");
  text = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  text = text.replace(/"{2,}/g, "\"");
  text = text.replace(/[[\]{}]/g, "");

  let tokens = text.split(/","/).map((t) => t.replace(/^"|"$/g, "").trim());
  tokens = tokens.map((t) => t.replace(/^\d{1,2}:/, "").replace(/"/g, "").trim());

  const trackIndices: number[] = [];
  tokens.forEach((t, i) => { if (/^S[A-Z0-9]{6,10}$/.test(t)) trackIndices.push(i); });

  const rows: RawDocumentLine[] = [];
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
      tracking_number:  tracking.toUpperCase(),
      cod_amount:       codAmount,
      delivery_fee:     Math.max(0, codAmount - netPaid),
      return_fee:       0,
      payout_amount:    netPaid,
      status:           window[statusIdx] || "",
      raw_line_payload: { order_number: orderNumber },
    });
  }
  return rows;
}

export function parseDocumentCsv(text: string): RawDocumentLine[] {
  // Auto-détection élargie: le fichier réel commence parfois par un
  // guillemet AVANT le crochet ("[..." au lieu de juste "[...") à cause de
  // la corruption Excel — sans ça, on ratait le routage vers le bon parser.
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("\"[") || trimmed.startsWith("\"\"[")) {
    const strict = parseCashPaidJson(trimmed);
    if (strict.length > 0) return strict;
    return parseCashPaidResilient(trimmed);
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const sep     = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, "").replace(/\s+/g, "_"));
  const get     = (row: string[], keys: string[]) => {
    for (const k of keys) {
      const idx = headers.findIndex((h) => h.includes(k));
      if (idx >= 0 && row[idx]?.trim()) return row[idx].trim().replace(/['"]/g, "");
    }
    return "";
  };
  const num = (row: string[], keys: string[]) => parseFloat(get(row, keys).replace(",", ".")) || 0;

  return lines.slice(1).map((line) => {
    const cols = line.split(sep);
    const tracking = get(cols, ["tracking", "traking", "bordereau", "code_suivi", "num"]);
    if (!tracking) return null;
    return {
      tracking_number:  tracking.toUpperCase(),
      cod_amount:       num(cols, ["cod", "montant_cod", "prix_client", "prix"]),
      delivery_fee:     num(cols, ["frais", "fee", "livraison_fee", "delivery_fee", "cout"]),
      return_fee:       num(cols, ["retour", "return_fee", "frais_retour"]),
      payout_amount:    num(cols, ["net", "paye", "payé", "montant_net", "paiement"]),
      city:             get(cols, ["ville", "city", "destination"]),
      status:           get(cols, ["statut", "status", "etat", "état"]),
      raw_line_payload: { raw: line },
    } as RawDocumentLine;
  }).filter(Boolean) as RawDocumentLine[];
}

