import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getAfterDelivery, type AfterDeliveryRow } from "@/lib/products/after-delivery";
import { ProductsFilterBar } from "@/components/products/products-filter-bar";

export const metadata: Metadata = { title: "Après livraison" };
export const dynamic = "force-dynamic";

interface Props { searchParams: Promise<{ period?: string; from?: string; to?: string }> }

const mad = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} DH`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function cpdColor(cpd: number | null, margin: number) {
  if (cpd == null || margin <= 0) return "text-muted-foreground";
  if (cpd <= margin * 0.6) return "text-emerald-600";
  if (cpd <= margin) return "text-amber-600";
  return "text-red-600";
}
function profitColor(n: number) { return n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-muted-foreground"; }

function Kpi({ label, value, sub, cls = "" }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function AfterDeliveryPage({ searchParams }: Props) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const params = await searchParams;
  const now = new Date();
  let from: string, to: string;
  if (params.from && params.to) { from = params.from; to = params.to; }
  else {
    const days = parseInt(params.period ?? "15", 10) || 15;
    from = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  }

  const { rows, globalRate, totals: t } = await getAfterDelivery(from, to);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Après livraison</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Coût de la pub par commande <b>livrée</b> pour chaque produit, et projection quand les colis en route seront arrivés
          (taux de livraison du produit, sinon taux global {pct(globalRate)}).
        </p>
      </div>

      <ProductsFilterBar activePeriod={params.from ? "" : (params.period ?? "15")} from={from} to={to} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Pub" value={mad(t.spend)} sub={`${num(t.orders)} commandes · ${mad(t.cpo)}/cmd`} />
        <Kpi label="Livrées" value={num(t.delivered)} sub={`${num(t.returned)} retours · ${num(t.onRoad + t.toShip)} en route`} />
        <Kpi label="Taux de livraison" value={pct(t.deliveryRate)} sub={`confirmation ${pct(t.confirmRate)}`} />
        <Kpi label="Pub / livrée (aujourd'hui)" value={mad(t.cpDelivered)} cls={cpdColor(t.cpDelivered, t.marginPerDelivered)} />
        <Kpi label="Pub / livrée (projection)" value={mad(t.cpDeliveredProjected)} sub={`≈ ${num(t.projectedDelivered)} livrées`} cls={cpdColor(t.cpDeliveredProjected, t.marginPerDelivered)} />
        <Kpi label="Profit après pub" value={mad(t.profitNow)} sub={`projection ${mad(t.profitProjected)}`} cls={profitColor(t.profitNow)} />
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-secondary/30 text-[10px] uppercase tracking-wide text-muted-foreground">
              {["Produit", "Pub", "Cmd", "Annul.", "À appeler", "Confirm.", "En route", "Livrées", "Retours",
                "Tx conf.", "Tx livr.", "Pub/cmd", "Pub/confirmée", "Pub/livrée", "Pub/livrée projetée",
                "Marge/livrée", "Profit après pub", "Profit projeté"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={18} className="px-3 py-8 text-center text-muted-foreground">Aucune donnée sur cette période.</td></tr>
            )}
            {rows.map((r: AfterDeliveryRow) => (
              <tr key={r.product_id} className="hover:bg-secondary/20">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-[180px]">
                    {r.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={r.image} alt="" className="h-9 w-9 rounded object-cover" loading="lazy" />
                      : <div className="h-9 w-9 rounded bg-secondary" />}
                    <div>
                      <p className="font-medium leading-tight" dir="auto">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{mad(r.sale_price)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(r.spend)}</td>
                <td className="px-3 py-2">{num(r.orders)}</td>
                <td className="px-3 py-2 text-muted-foreground">{num(r.cancelled)}</td>
                <td className="px-3 py-2 text-muted-foreground">{num(r.pendingCall)}</td>
                <td className="px-3 py-2">{num(r.confirmed)}</td>
                <td className="px-3 py-2 text-indigo-600">{num(r.onRoad + r.toShip)}</td>
                <td className="px-3 py-2 font-semibold text-emerald-700">{num(r.delivered)}</td>
                <td className="px-3 py-2 text-red-600">{num(r.returned)}</td>
                <td className="px-3 py-2">{pct(r.confirmRate)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{pct(r.deliveryRate)}{r.deliveryRateSource === "global" && <span className="text-[9px] text-muted-foreground"> (global)</span>}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(r.cpo)}</td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(r.cpConfirmed)}</td>
                <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${cpdColor(r.cpDelivered, r.marginPerDelivered)}`}>{mad(r.cpDelivered)}</td>
                <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${cpdColor(r.cpDeliveredProjected, r.marginPerDelivered)}`}>
                  {mad(r.cpDeliveredProjected)} <span className="text-[9px] text-muted-foreground font-normal">≈{num(r.projectedDelivered)} livr.</span>
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(r.marginPerDelivered)}</td>
                <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${profitColor(r.profitNow)}`}>{mad(r.profitNow)}</td>
                <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${profitColor(r.profitProjected)}`}>{mad(r.profitProjected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <b>Marge/livrée</b> = prix encaissé − achat − emballage − livraison (vrai frais Digylog, sinon tarif ville ; livreur propre = son prix).
        <b> Pub/livrée</b> en <span className="text-emerald-600">vert</span> = moins de 60% de la marge, <span className="text-amber-600">orange</span> = rentable mais serré,
        <span className="text-red-600"> rouge</span> = la pub coûte plus que la marge. <b>Projection</b> = (colis en route + confirmés à envoyer + commandes pas encore appelées × taux de confirmation) × taux de livraison.
        Pub = dépense synchronisée par produit sur la période (commandes comptées par date de création).
      </p>
    </div>
  );
}
