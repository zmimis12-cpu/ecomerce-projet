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

export function parseDocumentCsv(text: string): RawDocumentLine[] {
  // Auto-détection: contenu commençant par "[" = format JSON "Cash Paid" de
  // Digylog, pas un vrai CSV — on route vers le bon parser.
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    return parseCashPaidJson(trimmed);
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

