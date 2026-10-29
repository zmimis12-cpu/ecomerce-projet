/**
 * Taux exacts du call center, calculés sur les COMMANDES (pas sur les appels) —
 * mêmes définitions que le dashboard :
 *   confirmation = commandes passées par « confirmé » (historique) / commandes traitées
 *                  (traitée = au moins un appel, ou statut autre que nouveau)
 *   livraison    = livrées / colis terminés (livrées + retours/refus) — les colis encore en route ne comptent pas
 * Server only.
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

const SHIPPED = new Set(["sent_to_delivery", "in_transit", "delivered", "paid", "exchanged", "returned", "refused_delivery"]);
const DELIVERED = new Set(["delivered", "paid", "exchanged"]);

export type AgentRates = {
  assigned: number; treated: number; confirmed: number; shipped: number; delivered: number; paid: number;
  refused: number; fake: number; returned: number; inTransit: number; noAnswer: number; cancelled: number; confirmRate: number; deliveryRate: number;
};

export async function agentRates(agentIds: string[]): Promise<Map<string, AgentRates>> {
  const out = new Map<string, AgentRates>();
  if (!agentIds.length) return out;
  const { data } = await supabaseAdmin.from("orders")
    .select("id, assigned_to, status, call_status, call_attempts, is_paid")
    .in("assigned_to", agentIds).limit(10000);
  const orders = (data ?? []) as { id: string; assigned_to: string; status: string; call_status: string | null; call_attempts: number | null; is_paid: boolean }[];
  const everC = new Set<string>(), everS = new Set<string>();
  const ids = orders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data: h } = await supabaseAdmin.from("order_status_history").select("order_id, to_status")
      .in("to_status", ["confirmed", "sent_to_delivery"]).in("order_id", ids.slice(i, i + 150));
    for (const r of (h ?? []) as { order_id: string; to_status: string }[]) (r.to_status === "confirmed" ? everC : everS).add(r.order_id);
  }
  for (const id of agentIds) {
    const mine = orders.filter((o) => o.assigned_to === id);
    const treated = mine.filter((o) => (o.call_attempts ?? 0) > 0 || !["new", "pending"].includes(o.status));
    const shipped = mine.filter((o) => everS.has(o.id) || SHIPPED.has(o.status));
    const confirmed = mine.filter((o) => everC.has(o.id) || o.status === "confirmed" || everS.has(o.id) || SHIPPED.has(o.status));
    const delivered = mine.filter((o) => DELIVERED.has(o.status));
    const returned = mine.filter((o) => o.status === "returned" || o.status === "refused_delivery");
    const inTransit = mine.filter((o) => o.status === "sent_to_delivery" || o.status === "in_transit");
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    out.set(id, {
      assigned: mine.length, treated: treated.length, confirmed: confirmed.length, shipped: shipped.length,
      delivered: delivered.length, paid: mine.filter((o) => o.is_paid).length,
      refused: mine.filter((o) => o.status === "refused" || o.call_status === "refused").length,
      fake: mine.filter((o) => o.call_status === "fake_order").length,
      returned: returned.length, inTransit: inTransit.length,
      noAnswer: mine.filter((o) => o.status === "no_answer").length, cancelled: mine.filter((o) => o.status === "cancelled").length,
      confirmRate: pct(confirmed.length, treated.length), deliveryRate: pct(delivered.length, delivered.length + returned.length),
    });
  }
  return out;
}

/** Total de tous les agents (vue globale). */
export function sumRates(m: Map<string, AgentRates>): AgentRates {
  const t = { assigned: 0, treated: 0, confirmed: 0, shipped: 0, delivered: 0, paid: 0, refused: 0, fake: 0, returned: 0, inTransit: 0, noAnswer: 0, cancelled: 0, confirmRate: 0, deliveryRate: 0 };
  for (const r of m.values()) for (const k of Object.keys(t) as (keyof AgentRates)[]) if (k !== "confirmRate" && k !== "deliveryRate") t[k] += r[k];
  t.confirmRate = t.treated ? Math.round((t.confirmed / t.treated) * 100) : 0;
  t.deliveryRate = t.delivered + t.returned ? Math.round((t.delivered / (t.delivered + t.returned)) * 100) : 0;
  return t;
}
