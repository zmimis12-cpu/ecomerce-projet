/** Frais par transporteur (MAD) — modifiables dans Livraison → Comparatif transporteurs. */
export type CarrierKey = "digylog" | "speedaf" | "self";
export type CarrierFee = { casa: number; other: number; returnFee: number };
export type CarrierFees = Record<"digylog" | "speedaf", CarrierFee>;

export const DEFAULT_CARRIER_FEES: CarrierFees = {
  digylog: { casa: 20, other: 35, returnFee: 0 },
  speedaf: { casa: 20, other: 35, returnFee: 0 },
};

export const CARRIER_LABEL: Record<CarrierKey, string> = { digylog: "Digylog", speedaf: "Speedaf", self: "Livreur propre" };

export function isCasa(city: string | null | undefined) {
  const c = (city ?? "").toLowerCase();
  return c.includes("casablanca") || c.includes("casa") || c === "الدار البيضاء";
}

/** Frais de livraison d'un colis livré. Digylog : vrai frais synchronisé s'il existe. */
export function deliveryFee(fees: CarrierFees, carrier: CarrierKey, city: string | null, actual?: number | null) {
  if (carrier === "self") return 0;
  if (carrier === "digylog" && actual != null) return Number(actual);
  const f = fees[carrier];
  return isCasa(city) ? f.casa : f.other;
}

export function normalizeFees(v: Partial<Record<string, Partial<CarrierFee>>> | null | undefined): CarrierFees {
  const one = (k: "digylog" | "speedaf") => {
    const d = DEFAULT_CARRIER_FEES[k], x = v?.[k] ?? {};
    const n = (a: unknown, b: number) => (Number.isFinite(Number(a)) && a !== "" && a != null ? Math.max(0, Number(a)) : b);
    return { casa: n(x.casa, d.casa), other: n(x.other, d.other), returnFee: n(x.returnFee, d.returnFee) };
  };
  return { digylog: one("digylog"), speedaf: one("speedaf") };
}
