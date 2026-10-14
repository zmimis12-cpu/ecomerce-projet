import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUsdToMad } from "@/lib/ads/fx";
import { TiktokSpendForm, DeleteTiktokSpend } from "@/components/ads/tiktok-spend-form";

export const metadata: Metadata = { title: "Dépenses TikTok" };
export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR");

export default async function TiktokSpendPage() {
  await requireRole(["super_admin", "admin", "manager"]);
  const monthStart = new Date().toISOString().slice(0, 8) + "01";

  const [{ data: products }, { data: rows }, fx] = await Promise.all([
    supabaseAdmin.from("products").select("id, name").eq("is_active", true).order("name"),
    supabaseAdmin.from("product_ad_spend")
      .select("id, product_id, spend_mad, period_start, period_end, matched_campaign_names, synced_at")
      .eq("platform", "tiktok").order("period_start", { ascending: false }).limit(200),
    getUsdToMad(),
  ]);

  const prods = (products ?? []) as { id: string; name: string }[];
  const nameOf = new Map(prods.map((p) => [p.id, p.name]));
  const list = (rows ?? []) as { id: string; product_id: string; spend_mad: number; period_start: string; period_end: string; matched_campaign_names: string[] }[];

  const month = list.filter((r) => r.period_start >= monthStart);
  const monthTotal = month.reduce((s, r) => s + Number(r.spend_mad), 0);
  const byProduct = new Map<string, number>();
  for (const r of month) byProduct.set(r.product_id, (byProduct.get(r.product_id) ?? 0) + Number(r.spend_mad));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dépenses TikTok</h1>
        <p className="text-sm text-muted-foreground">
          En attendant l&apos;API TikTok : saisis chaque jour ce que TikTok Ads Manager affiche (colonne « Coût »), par produit.
          Le montant est compté partout : dashboard, profit par produit, calculs par produit.
          Dès que l&apos;app TikTok sera validée, la synchro remplacera ces saisies par les vrais chiffres.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <TiktokSpendForm products={prods} rate={fx.base} />
        <p className="mt-3 text-xs text-muted-foreground">Taux appliqué : 1 $ = {fx.base.toFixed(2)} MAD (marché + frais banque, sans TVA Meta).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">TikTok ce mois</div>
          <div className="mt-1 text-2xl font-semibold">{fmt(monthTotal)} MAD</div>
        </div>
        {[...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([pid, v]) => (
          <div key={pid} className="rounded-xl border bg-card p-4">
            <div className="truncate text-xs uppercase text-muted-foreground">{nameOf.get(pid) ?? "Produit"}</div>
            <div className="mt-1 text-2xl font-semibold">{fmt(v)} MAD</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Jour</th><th className="p-3">Produit</th><th className="p-3">Source</th><th className="p-3 text-right">Montant</th><th className="p-3" /></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Aucune dépense TikTok saisie.</td></tr>}
            {list.map((r) => {
              const manual = (r.matched_campaign_names ?? []).some((n) => n.startsWith("Saisie manuelle"));
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{r.period_start === r.period_end ? r.period_start : `${r.period_start} → ${r.period_end}`}</td>
                  <td className="p-3">{nameOf.get(r.product_id) ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{manual ? (r.matched_campaign_names[0].split(" — ")[1] ?? "Saisie manuelle") : "API TikTok"}</td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{fmt(Number(r.spend_mad))} MAD</td>
                  <td className="p-3 text-right">{manual && <DeleteTiktokSpend id={r.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
