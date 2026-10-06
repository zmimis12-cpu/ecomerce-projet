import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { productEconomicsDetail } from "@/lib/products/economics";
import { PeriodFilter, currentMonth } from "@/components/creatives/period-filter";

export const metadata: Metadata = { title: "Calcul produit" };
export const dynamic = "force-dynamic";

const mad = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} MAD`);
const pct = (n: number) => `${Math.round(n * 100)} %`;

function Line({ label, value, hint, strong, tone }: { label: string; value: string; hint?: string; strong?: boolean; tone?: "red" | "green" }) {
  return (
    <div className={`flex items-start justify-between gap-4 border-t py-2 ${strong ? "font-semibold" : ""}`}>
      <div><div>{label}</div>{hint && <div className="text-xs font-normal text-muted-foreground">{hint}</div>}</div>
      <div className={`whitespace-nowrap ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}

export default async function ProductCalcPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const { id } = await params; const sp = await searchParams;
  const period = sp.month ?? currentMonth();
  const e = await productEconomicsDetail(id, period);
  const { product: p, counts: c, rates: r, money: m, unit: u } = e;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/admin/products/calculs?month=${period}`} className="text-xs text-muted-foreground hover:underline">← Tous les produits</Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold"><Calculator className="h-5 w-5 text-primary" /> {p.name}</h1>
        </div>
        <PeriodFilter period={period} extra={{}} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">1. Ce que te coûte UNE pièce</h2>
          <Line label="Prix de vente (1 pièce)" value={mad(p.price)} />
          <Line label="− Prix d'achat" value={mad(p.purchase)} hint="Fiche produit — vérifie avec ta facture fournisseur" />
          <Line label="− Emballage" value={mad(p.packaging)} />
          <Line label="− Livraison Digylog (moyenne réelle)" value={mad(u.avgFee)} hint="20 MAD Casablanca · 35 MAD ailleurs" />
          <Line label="= Marge par livraison (avant pub)" value={mad(u.unitMargin)} strong tone={u.unitMargin >= 0 ? "green" : "red"} />
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">2. Ce que deviennent tes commandes</h2>
          <Line label="Commandes reçues" value={String(c.leads)} />
          <Line label="En attente d'appel (nouvelles / sans réponse)" value={String(c.pendingCall)} />
          <Line label="Annulées" value={String(c.cancelled)} />
          <Line label="Expédiées" value={String(c.shipped)} hint={`Taux de confirmation = expédiées ÷ (reçues − en attente) = ${pct(r.confirmRate)}`} />
          <Line label="Encore en transit" value={String(c.inTransit)} />
          <Line label="Livrées" value={String(c.delivered)} hint={`Taux de livraison = livrées ÷ (livrées + retours) = ${pct(r.deliveryRate)}`} />
          <Line label="Retours / refus" value={String(c.returned)} />
          <Line label="Payées par Digylog" value={String(c.paid)} />
          <Line label="= Sur 100 commandes, livrées" value={`≈ ${Math.round(r.ordersToDelivered * 100)}`} strong hint="confirmation × livraison" />
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">3. Profit réellement encaissé</h2>
          <Line label={`Ventes des ${c.paid} commandes payées`} value={mad(m.revenue)} />
          <Line label="− Achat + emballage (× nombre de pièces)" value={mad(m.goods)} />
          <Line label="− Livraisons Digylog" value={mad(m.deliveryCost)} />
          <Line label="= Marge avant pub" value={mad(m.marginBeforeAds)} strong />
          {Object.entries(m.adsByPlatform).map(([pl, v]) => (
            <Line key={pl} label={`− Pub ${pl === "meta" ? "Meta" : pl === "tiktok" ? "TikTok" : pl}`} value={mad(v)} hint="Dépense réelle, taxe de chaque compte incluse" />
          ))}
          {Object.keys(m.adsByPlatform).length === 0 && <Line label="− Pub" value={mad(0)} hint="Aucune campagne reliée à ce produit sur la période" />}
          <Line label="− Confirmation" value={mad(m.ccCost)} hint={`${m.ccOrders} commandes payées traitées par un agent × ${m.ccPer} MAD (fiche produit)`} />
          <Line label="− Éditeurs vidéo" value={mad(m.editorCost)} />
          <Line label="= Profit net encaissé" value={mad(m.netProfit)} strong tone={m.netProfit >= 0 ? "green" : "red"} />
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 font-semibold">4. Ce qui va encore rentrer</h2>
          <Line label={`${c.pending} commandes livrées pas encore payées`} value={mad(m.pendingRevenue)} hint="Prix payé par les clients" />
          <Line label="= Leur marge (après achat et livraison)" value={mad(m.pendingMargin)} tone="green" />
          <Line label="Profit net si tout est payé" value={mad(m.netIfPendingPaid)} strong tone={m.netIfPendingPaid >= 0 ? "green" : "red"}
            hint={`Les ${c.inTransit} commandes en transit ne sont pas comptées (on ne sait pas si elles seront livrées)`} />
        </section>

        <section className="rounded-xl border bg-card p-4 text-sm lg:col-span-2">
          <h2 className="mb-2 font-semibold">5. Ta limite de pub (pour rester rentable)</h2>
          <Line label="Coût pub par commande (réel)" value={mad(u.cpo)} hint="Pub ÷ commandes reçues"
            tone={u.cpo != null && u.cpo > u.breakEvenCpo ? "red" : "green"} />
          <Line label="Coût pub max par commande (point mort)" value={mad(u.breakEvenCpo)}
            hint={`Marge par livraison ${mad(u.unitMargin)} × ${Math.round(r.ordersToDelivered * 100)} % de commandes livrées`} strong />
          <Line label="Coût pub par livraison (réel)" value={mad(u.cpd)} hint="Pub ÷ commandes livrées"
            tone={u.cpd != null && u.cpd > u.breakEvenCpd ? "red" : "green"} />
          <Line label="Coût pub max par livraison (point mort)" value={mad(u.breakEvenCpd)} hint="= marge par livraison" strong />
          <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs">
            {u.cpo == null ? "Pas encore de commande sur la période."
              : u.cpo <= u.breakEvenCpo * 0.8 ? "✅ Rentable avec de la marge : tu peux augmenter le budget petit à petit (+20 % tous les 2 jours)."
              : u.cpo <= u.breakEvenCpo ? "⚠️ Proche du point mort : améliore la confirmation / les vidéos avant d'augmenter le budget."
              : "❌ Au-dessus du point mort : ce produit perd de l'argent. Coupe les pubs chères, teste de nouvelles vidéos ou améliore la confirmation."}
          </p>
        </section>
      </div>
    </div>
  );
}
