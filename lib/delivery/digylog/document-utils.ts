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

export function parseDocumentCsv(text: string): RawDocumentLine[] {
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

