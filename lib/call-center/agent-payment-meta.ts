/** Mode de paiement + justificatif des paiements agents (rangés dans la colonne notes, en JSON). */
export const AGENT_PAY_METHODS = [
  { key: "especes", label: "Espèces" },
  { key: "virement", label: "Virement bancaire" },
  { key: "cashplus", label: "CashPlus" },
  { key: "wafacash", label: "Wafacash" },
  { key: "barid", label: "Barid Cash" },
  { key: "cih", label: "CIH / transfert mobile" },
  { key: "autre", label: "Autre" },
] as const;
export type AgentPayMethod = (typeof AGENT_PAY_METHODS)[number]["key"];
export const methodLabel = (k?: string | null) => AGENT_PAY_METHODS.find((m) => m.key === k)?.label ?? (k || "—");

export type AgentPayMeta = { text: string; method: string | null; ref: string | null; proof: string | null; salary?: number };

export function parseAgentPayNotes(notes: string | null | undefined): AgentPayMeta {
  if (notes && notes.startsWith("{")) {
    try {
      const j = JSON.parse(notes) as Partial<{ t: string; m: string; r: string; p: string; s: number }>;
      return { text: j.t ?? "", method: j.m ?? null, ref: j.r ?? null, proof: j.p ?? null, salary: j.s };
    } catch { /* ancien texte libre */ }
  }
  return { text: notes ?? "", method: null, ref: null, proof: null };
}

export function encodeAgentPayNotes(m: AgentPayMeta): string {
  return JSON.stringify({ t: m.text || undefined, m: m.method || undefined, r: m.ref || undefined, p: m.proof || undefined, s: m.salary || undefined });
}
