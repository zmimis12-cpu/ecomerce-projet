/** Types + libellés de rémunération call center (utilisable côté client). */
export type PayMode = "product" | "commission" | "salary" | "hybrid";
export type PayBasis = "confirmed" | "shipped" | "delivered" | "paid";
export type AgentPay = { mode: PayMode; basis: PayBasis; amount: number; salary: number };

export const DEFAULT_PAY: AgentPay = { mode: "product", basis: "paid", amount: 0, salary: 0 };
export const PAY_MODES: PayMode[] = ["product", "commission", "salary", "hybrid"];
export const PAY_BASES: PayBasis[] = ["confirmed", "shipped", "delivered", "paid"];

export function normalizePay(v: unknown): AgentPay {
  const p = (v && typeof v === "object" ? v : {}) as Partial<AgentPay>;
  const mode = PAY_MODES.includes(p.mode as PayMode) ? (p.mode as PayMode) : DEFAULT_PAY.mode;
  const basis = PAY_BASES.includes(p.basis as PayBasis) ? (p.basis as PayBasis) : DEFAULT_PAY.basis;
  const n = (x: unknown) => Math.max(0, Number(x) || 0);
  return { mode, basis, amount: n(p.amount), salary: n(p.salary) };
}

export const usesCommission = (p: AgentPay) => p.mode === "commission" || p.mode === "hybrid";
export const usesSalary = (p: AgentPay) => p.mode === "salary" || p.mode === "hybrid";

export const PAY_MODE_LABEL: Record<PayMode, string> = {
  product: "Coût confirmation fiche produit",
  commission: "Commission par commande",
  salary: "Salaire fixe mensuel",
  hybrid: "Salaire fixe + commission",
};
export const PAY_BASIS_LABEL: Record<PayBasis, string> = {
  confirmed: "par commande confirmée",
  shipped: "par commande expédiée",
  delivered: "par commande livrée",
  paid: "par commande payée",
};
