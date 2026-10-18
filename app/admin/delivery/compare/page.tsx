import type { Metadata } from "next";
import { Scale, Trophy } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readCarrierFees, getCarrierResolver, deliveryFee, CARRIER_LABEL, type CarrierKey } from "@/lib/delivery/carrier-fees";
import { CarrierFeesForm } from "@/components/delivery/carrier-fees-form";

export const metadata: Metadata = { title: "Comparatif transporteurs" };
export const dynamic = "force-dynamic";

const DELIVERED = new Set(["delivered", "paid", "exchanged"]);
const RETURNED  = new Set(["returned", "refused_delivery"]);
const ONGOING   = new Set(["sent_to_delivery", "in_transit"]);
const mad = (n: number) => Math.round(n).toLocaleString("fr-MA") + " MAD";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 + " %" : "—");

const PERIODS = [
  { v: "7", l: "7 derniers jours" }, { v: "30", l: "30 derniers jours" },
  { v: "90", l: "90 derniers jours" }, { v: "all", l: "Tout" },
];

type Row = {
  id: string; status: string; customer_city: string | null; total_amount_mad: number | null;
  actual_cod_collected_mad: number | null; actual_delivery_cost: number | null;
  delivery_company_id: string | null; fulfillment_type: string | null;
  sent_to_delivery_at: string | null; delivered_at: string | null;
};

export default async function CarrierComparePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const sp = await searchParams;
  const period = PERIODS.some((p) => p.v === sp.p) ? sp.p : "30";
  const since = period === "all" ? null : new Date(Date.now() - Number(period) * 86_400_000).toISOString();

  const [fees, carrierOf] = await Promise.all([readCarrierFees(), getCarrierResolver()]);

  // Colis expédiés de la période (par date d'envoi), par pages de 1000
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabaseAdmin.from("orders")
      .select("id, status, customer_city, total_amount_mad, actual_cod_collected_mad, actual_delivery_cost, delivery_company_id, fulfillment_type, sent_to_delivery_at, delivered_at")
      .not("sent_to_delivery_at", "is", null)
      .neq("status", "cancelled")
      .order("sent_to_delivery_at", { ascending: false })
      .range(from, from + 999);
    if (since) q = q.gte("sent_to_delivery_at", since);
    const { data } = await q;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }

  type Agg = { shipped: number; delivered: number; returned: number; ongoing: number; revenue: number;
    deliveryFees: number; returnFees: number; days: number; daysN: number };
  const agg = new Map<CarrierKey, Agg>();
  for (const o of rows) {
    const k = carrierOf(o);
    const a = agg.get(k) ?? { shipped: 0, delivered: 0, returned: 0, ongoing: 0, revenue: 0, deliveryFees: 0, returnFees: 0, days: 0, daysN: 0 };
    a.shipped++;
    if (DELIVERED.has(o.status)) {
      a.delivered++;
      a.revenue += Number(o.actual_cod_collected_mad ?? o.total_amount_mad ?? 0);
      a.deliveryFees += deliveryFee(fees, k, o.customer_city, o.actual_delivery_cost);
      if (o.delivered_at && o.sent_to_delivery_at) {
        const d = (new Date(o.delivered_at).getTime() - new Date(o.sent_to_delivery_at).getTime()) / 86_400_000;
        if (d >= 0 && d < 60) { a.days += d; a.daysN++; }
      }
    } else if (RETURNED.has(o.status)) {
      a.returned++;
      a.returnFees += k === "self" ? 0 : fees[k].returnFee;
    } else if (ONGOING.has(o.status)) a.ongoing++;
    agg.set(k, a);
  }

  const list = (["digylog", "speedaf", "self"] as CarrierKey[])
    .filter((k) => agg.has(k))
    .map((k) => {
      const a = agg.get(k)!;
      const net = a.revenue - a.deliveryFees - a.returnFees;
      return {
        k, ...a, net,
        finished: a.delivered + a.returned,
        costPerDelivered: a.delivered ? (a.deliveryFees + a.returnFees) / a.delivered : null,
        netPerShipped: a.shipped ? net / a.shipped : null,
        avgDays: a.daysN ? a.days / a.daysN : null,
      };
    });
  // Le plus rentable = meilleur net encaissé par colis expédié (parmi les transporteurs avec ≥ 10 colis terminés)
  const eligible = list.filter((x) => x.k !== "self" && x.finished >= 10);
  const best = eligible.length > 1 ? eligible.reduce((b, x) => ((x.netPerShipped ?? -1e9) > (b.netPerShipped ?? -1e9) ? x : b)) : null;

  const lines: { label: string; get: (x: (typeof list)[number]) => string; hint?: string }[] = [
    { label: "Colis expédiés", get: (x) => x.shipped.toLocaleString("fr-MA") },
    { label: "Livrés", get: (x) => x.delivered.toLocaleString("fr-MA") },
    { label: "Retours / refusés", get: (x) => x.returned.toLocaleString("fr-MA") },
    { label: "En cours", get: (x) => x.ongoing.toLocaleString("fr-MA") },
    { label: "Taux de livraison", get: (x) => pct(x.delivered, x.finished), hint: "livrés ÷ (livrés + retours) — colis terminés seulement" },
    { label: "Taux de retour", get: (x) => pct(x.returned, x.finished) },
    { label: "Délai moyen de livraison", get: (x) => (x.avgDays == null ? "—" : `${x.avgDays.toFixed(1)} j`) },
    { label: "CA livré", get: (x) => mad(x.revenue) },
    { label: "Frais de livraison", get: (x) => mad(x.deliveryFees) },
    { label: "Frais de retour", get: (x) => mad(x.returnFees) },
    { label: "Net encaissé", get: (x) => mad(x.net), hint: "CA livré − frais livraison − frais retour" },
    { label: "Coût logistique / colis livré", get: (x) => (x.costPerDelivered == null ? "—" : mad(x.costPerDelivered)) },
    { label: "Net par colis expédié", get: (x) => (x.netPerShipped == null ? "—" : mad(x.netPerShipped)), hint: "le chiffre qui dit qui est le plus rentable" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Scale className="h-5 w-5 text-primary" /> Comparatif transporteurs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Colis envoyés sur la période (date d&apos;envoi) — taux, frais et net encaissé par société de livraison.</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <select name="p" defaultValue={period} className="h-9 rounded-md border bg-background px-3 text-sm">
            {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select>
          <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">Filtrer</button>
        </form>
      </div>

      {best && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <Trophy className="h-4 w-4" />
          <span><b>{CARRIER_LABEL[best.k]}</b> est le plus rentable sur la période : {best.netPerShipped == null ? "—" : mad(best.netPerShipped)} net par colis expédié.</span>
        </div>
      )}

      <section className="overflow-x-auto rounded-xl border bg-card">
        {list.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Aucun colis expédié sur cette période.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2" />
                {list.map((x) => (
                  <th key={x.k} className="px-4 py-2 text-right text-sm font-semibold text-foreground">
                    {CARRIER_LABEL[x.k]}{best?.k === x.k && " 🏆"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.label} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{l.label}</div>
                    {l.hint && <div className="text-[11px] text-muted-foreground">{l.hint}</div>}
                  </td>
                  {list.map((x) => <td key={x.k} className="px-4 py-2 text-right tabular-nums">{l.get(x)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 font-medium">Frais par transporteur</h2>
        <p className="mb-3 text-xs text-muted-foreground">Mets les tarifs de ton contrat (MAD). Utilisés ici et dans le tableau de bord (Net à recevoir, Net collecté, profit).</p>
        <CarrierFeesForm initial={fees} />
      </section>
    </div>
  );
}
