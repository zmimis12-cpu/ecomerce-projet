/**
 * lib/call-center/pay.ts — rémunération des agents call center, réglable par agent
 * depuis l'admin (fiche agent). Source unique pour le dashboard, les commissions
 * et "Mes gains" → même chiffre partout. Server only.
 *
 * Modes :
 *   product    → coût de confirmation de la fiche produit, par commande payée (ancien calcul, défaut)
 *   commission → X DH par commande selon la base choisie (confirmée / expédiée / livrée / payée)
 *   salary     → salaire fixe Y DH / mois (au prorata des jours de la période)
 *   hybrid     → salaire fixe + commission
 * Stocké dans call_center_agents.metadata.pay (+ colonnes salary_type / fixed_salary_mad / commission_per_delivered).
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

import { DEFAULT_PAY, normalizePay, usesCommission, usesSalary, type AgentPay, type PayBasis } from "@/lib/call-center/pay-shared";
export * from "@/lib/call-center/pay-shared";
export type AgentPayRow = AgentPay & { userId: string; active: boolean; since: string };

const SHIPPED = new Set(["sent_to_delivery", "in_transit", "delivered", "paid", "exchanged", "returned", "refused_delivery"]);
const DELIVERED = new Set(["delivered", "paid", "exchanged"]);

/** Config de tous les agents (clé = user_id = orders.assigned_to). */
export async function readAgentPays(): Promise<Map<string, AgentPayRow>> {
  const { data } = await supabaseAdmin
    .from("call_center_agents" as never)
    .select("user_id, active, created_at, metadata");
  const out = new Map<string, AgentPayRow>();
  for (const r of (data ?? []) as { user_id: string; active: boolean; created_at: string; metadata: Record<string, unknown> | null }[]) {
    const pay = normalizePay(r.metadata?.pay);
    const since = typeof (r.metadata?.pay as { since?: string } | undefined)?.since === "string"
      ? (r.metadata!.pay as { since: string }).since : r.created_at;
    out.set(r.user_id, { ...pay, userId: r.user_id, active: r.active !== false, since });
  }
  return out;
}

export type PayOrder = { id: string; status: string; is_paid: boolean; everConfirmed?: boolean; everShipped?: boolean };

/** La commande compte-t-elle pour la commission selon la base choisie ? */
export function orderQualifies(basis: PayBasis, o: PayOrder): boolean {
  switch (basis) {
    case "confirmed": return !!o.everConfirmed || o.status === "confirmed" || !!o.everShipped || SHIPPED.has(o.status);
    case "shipped":   return !!o.everShipped || SHIPPED.has(o.status);
    case "delivered": return DELIVERED.has(o.status);
    case "paid":      return !!o.is_paid || o.status === "paid";
  }
}

/** Salaire mensuel au prorata des jours (mois = 30 jours). Ne compte pas avant la date de début. */
export function salaryForPeriod(monthly: number, since: string, from: Date | null, to: Date | null): number {
  if (!monthly) return 0;
  const start = Math.max(from ? from.getTime() : 0, new Date(since).getTime());
  const end = Math.min(to ? to.getTime() : Date.now(), Date.now());
  if (end <= start) return 0;
  return Math.round(monthly * ((end - start) / 86_400_000) / 30 * 100) / 100;
}

/**
 * Coût call center d'une période (dashboard).
 * `orders` = commandes de la période (déjà filtrées), `confCost` = coût de confirmation fiche produit
 * (utilisé seulement pour les agents en mode "product").
 */
export function callCenterCost(
  orders: (PayOrder & { assigned_to: string | null })[],
  pays: Map<string, AgentPayRow>,
  confCost: Map<string, number>,
  from: Date | null, to: Date | null,
): { total: number; perOrder: Map<string, number> } {
  const perOrder = new Map<string, number>();
  let total = 0;
  for (const o of orders) {
    const p = o.assigned_to ? pays.get(o.assigned_to) : undefined;
    if (!p) continue;
    if (p.mode === "product") {
      // coût confirmation fiche produit : compté au moment où la commande est payée
      const c = confCost.get(o.id) ?? 0;
      if (c) { perOrder.set(o.id, c); if (o.is_paid) total += c; }
    } else if (usesCommission(p) && orderQualifies(p.basis, o)) {
      perOrder.set(o.id, p.amount); total += p.amount;
    }
  }
  for (const p of pays.values()) if (p.active && usesSalary(p)) total += salaryForPeriod(p.salary, p.since, from, to);
  return { total: Math.round(total * 100) / 100, perOrder };
}

/** Gains d'un agent (fiche agent, commissions, "Mes gains"). from/to = "YYYY-MM-DD" optionnels. */
export async function agentEarnings(userId: string, from?: string, to?: string) {
  const pays = await readAgentPays();
  const pay: AgentPayRow = pays.get(userId) ?? { ...DEFAULT_PAY, userId, active: true, since: new Date(0).toISOString() };

  let q = supabaseAdmin.from("orders").select("id, status, is_paid").eq("assigned_to", userId);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to + "T23:59:59");
  const { data } = await q;
  const orders = (data ?? []) as PayOrder[];

  const ids = orders.map((o) => o.id);
  const everC = new Set<string>(), everS = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: h } = await supabaseAdmin.from("order_status_history").select("order_id, to_status")
      .in("to_status", ["confirmed", "sent_to_delivery"]).in("order_id", ids.slice(i, i + 150));
    for (const r of (h ?? []) as { order_id: string; to_status: string }[]) (r.to_status === "confirmed" ? everC : everS).add(r.order_id);
  }
  const full = orders.map((o) => ({ ...o, everConfirmed: everC.has(o.id), everShipped: everS.has(o.id) }));

  let count = 0, commission = 0;
  if (pay.mode === "product") {
    // coût de confirmation fiche produit des commandes payées
    const paidIds = full.filter((o) => o.is_paid || o.status === "paid").map((o) => o.id);
    count = paidIds.length;
    if (paidIds.length) {
      const { data: its } = await supabaseAdmin.from("order_items").select("order_id, products(confirmation_cost_mad)").in("order_id", paidIds.slice(0, 500));
      const per = new Map<string, number>();
      for (const it of (its ?? []) as { order_id: string; products: { confirmation_cost_mad: number | null } | null }[])
        per.set(it.order_id, Math.max(per.get(it.order_id) ?? 0, Number(it.products?.confirmation_cost_mad ?? 0)));
      commission = [...per.values()].reduce((s, v) => s + v, 0);
    }
  } else if (usesCommission(pay)) {
    count = full.filter((o) => orderQualifies(pay.basis, o)).length;
    commission = count * pay.amount;
  }
  const salary = usesSalary(pay)
    ? salaryForPeriod(pay.salary, pay.since, from ? new Date(from + "T00:00:00Z") : null, to ? new Date(new Date(to + "T00:00:00Z").getTime() + 86_400_000) : null)
    : 0;
  commission = Math.round(commission * 100) / 100;
  return { pay, count, commission, salary, total: Math.round((commission + salary) * 100) / 100 };
}
