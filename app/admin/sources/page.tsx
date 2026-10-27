import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { getSourcesReport, PLATFORM_LABEL, type PlatformKey, type Stats } from "@/lib/analytics/sources";
import { ProductsFilterBar } from "@/components/products/products-filter-bar";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

interface Props { searchParams: Promise<{ period?: string; from?: string; to?: string; product?: string }> }

const mad = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} DH`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const pc = (n: number | null) => (n == null ? "text-muted-foreground" : n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "");

function StatRow({ label, s, strong }: { label: string; s: Stats; strong?: boolean }) {
  return (
    <tr className={strong ? "bg-secondary/30 font-semibold" : "hover:bg-secondary/20"}>
      <td className="px-3 py-2 whitespace-nowrap">{label}</td>
      <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(s.spend)}</td>
      <td className="px-3 py-2">{s.orders}</td>
      <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(s.cpo)}</td>
      <td className="px-3 py-2">{pct(s.confRate)}</td>
      <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(s.cpConfirmed)}</td>
      <td className="px-3 py-2">{pct(s.delRate)}</td>
      <td className="px-3 py-2 text-emerald-700">{s.delivered}</td>
      <td className="px-3 py-2 font-mono whitespace-nowrap">{mad(s.cpDelivered)}</td>
      <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${pc(s.profit)}`}>{mad(s.profit)}</td>
      <td className={`px-3 py-2 font-mono font-semibold whitespace-nowrap ${pc(s.profitProjected)}`}>{mad(s.profitProjected)}</td>
    </tr>
  );
}

const HEAD = ["Source", "Pub", "Cmd", "Pub/cmd", "Tx conf.", "Pub/confirmée", "Tx livr.", "Livrées", "Pub/livrée", "Profit net", "Profit projeté"];

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr className="border-b bg-secondary/30 text-[10px] uppercase tracking-wide text-muted-foreground">
          {HEAD.map((h) => <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export default async function SourcesPage({ searchParams }: Props) {
  await requireRole(["super_admin", "admin", "manager", "finance"]);
  const params = await searchParams;
  const now = new Date();
  let from: string, to: string;
  if (params.from && params.to) { from = params.from; to = params.to; }
  else {
    const days = parseInt(params.period ?? "30", 10) || 30;
    from = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  }
  const productId = params.product || null;
  const r = await getSourcesReport(from, to, productId);

  // Meilleure plateforme payante (profit projeté)
  const paid = r.platforms.filter((p) => p.key === "meta" || p.key === "tiktok" || p.key === "google");
  const best = [...paid].sort((a, b) => (b.profitProjected ?? -1e9) - (a.profitProjected ?? -1e9))[0];
  const ig = r.sources.find((s) => s.key === "instagram"), fb = r.sources.find((s) => s.key === "facebook");
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams();
    if (params.from && params.to) { u.set("from", from); u.set("to", to); } else u.set("period", params.period ?? "30");
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    return `?${u.toString()}`;
  };
  const plats = (Object.keys(PLATFORM_LABEL) as PlatformKey[]).filter((k) => r.products.some((p) => p.cells[k]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sources</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Quelle plateforme et quel placement ramènent des commandes <b>rentables</b> : pub, confirmation, livraison et profit net, par source.
        </p>
      </div>

      <ProductsFilterBar activePeriod={params.from ? "" : (params.period ?? "30")} from={from} to={to} />

      <div className="flex flex-wrap gap-1.5 text-xs">
        <a href={qs({})} className={`rounded-full border px-3 py-1 ${!productId ? "bg-foreground text-background" : "bg-card"}`}>Tous les produits</a>
        {r.productList.map((p) => (
          <a key={p.id} href={qs({ product: p.id })} dir="auto" className={`rounded-full border px-3 py-1 ${productId === p.id ? "bg-foreground text-background" : "bg-card"}`}>{p.name}</a>
        ))}
      </div>

      {/* Verdict */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] text-muted-foreground">Plateforme la plus rentable (projection)</p>
          <p className="text-lg font-bold">{best ? best.label : "—"}</p>
          <p className={`text-xs ${pc(best?.profitProjected ?? null)}`}>{best ? `${mad(best.profitProjected)} · ${mad(best.cpDelivered)}/livrée` : "Pas encore de données"}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] text-muted-foreground">Instagram vs Facebook (coût par livrée)</p>
          <p className="text-lg font-bold">{mad(ig?.cpDelivered ?? null)} <span className="text-muted-foreground text-sm font-normal">vs</span> {mad(fb?.cpDelivered ?? null)}</p>
          <p className="text-xs text-muted-foreground">
            {r.placementShare ? `Pub Meta : Instagram ${pct(r.placementShare.instagram)} · Facebook ${pct(r.placementShare.facebook)}` : "Répartition Meta indisponible"}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] text-muted-foreground">Total période</p>
          <p className={`text-lg font-bold ${pc(r.total.profitProjected)}`}>{mad(r.total.profitProjected)}</p>
          <p className="text-xs text-muted-foreground">{r.total.orders} cmd · pub {mad(r.total.spend)} · profit net actuel {mad(r.total.profit)}</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Par plateforme</h2>
        <Table>
          {r.platforms.map((p) => <StatRow key={p.key} label={p.label} s={p} />)}
          <StatRow label="Total" s={r.total} strong />
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Par placement (où le client a commandé)</h2>
        <Table>
          {r.sources.map((s) => <StatRow key={s.key} label={s.label} s={s} />)}
        </Table>
        <p className="text-[11px] text-muted-foreground">
          Pub Instagram / Facebook = dépense Meta répartie selon les placements réels lus chez Meta. « Meta (navigateur externe) » = clic sur une pub Meta mais commande passée hors appli.
        </p>
      </section>

      {!productId && r.products.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Produit × plateforme</h2>
          <div className="rounded-xl border bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b bg-secondary/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-3 py-2.5">Produit</th>
                {plats.map((k) => <th key={k} className="text-left px-3 py-2.5 whitespace-nowrap">{PLATFORM_LABEL[k]}</th>)}
                <th className="text-left px-3 py-2.5">Total</th>
              </tr></thead>
              <tbody className="divide-y">
                {r.products.map((p) => (
                  <tr key={p.id} className="hover:bg-secondary/20 align-top">
                    <td className="px-3 py-2 min-w-[160px]"><a href={qs({ product: p.id })} className="font-medium hover:underline" dir="auto">{p.name}</a></td>
                    {[...plats.map((k) => p.cells[k]), p.total].map((c, i) => (
                      <td key={i} className="px-3 py-2 whitespace-nowrap">
                        {c ? (<>
                          <div>{c.orders} cmd · {c.delivered} livr.</div>
                          <div className="text-muted-foreground">pub {mad(c.spend)} · {mad(c.cpDelivered)}/livr.</div>
                          <div className={`font-semibold ${pc(c.profitProjected)}`}>{mad(c.profitProjected)}</div>
                        </>) : <span className="text-muted-foreground">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Qui commande ?</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(r.profile) as PlatformKey[]).map((k) => {
            const p = r.profile[k]!;
            return (
              <div key={k} className="rounded-xl border bg-card p-4 space-y-2 text-xs">
                <p className="font-semibold text-sm">{PLATFORM_LABEL[k]}</p>
                <p><span className="text-muted-foreground">Villes : </span>{p.cities.map(([c, n]) => `${c} (${n})`).join(" · ")}</p>
                <p><span className="text-muted-foreground">Livrées surtout à : </span>{p.deliveredCities.length ? p.deliveredCities.map(([c, n]) => `${c} (${n})`).join(" · ") : "—"}</p>
                <p><span className="text-muted-foreground">Heures : </span>{p.hours.map(([h, n]) => `${h}h (${n})`).join(" · ")}</p>
                <p><span className="text-muted-foreground">Téléphones : </span>{p.devices.map(([d, n]) => `${d} (${n})`).join(" · ")}</p>
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <b>Source</b> détectée automatiquement : navigateur Instagram / Facebook / TikTok du client, clic pub (fbclid, ttclid, gclid).
        <b> Profit net</b> = marge des livrées − frais de retour − pub. <b>Projeté</b> = + commandes en cours × taux de confirmation × taux de livraison.
        Commandes sans doublons ni échanges, comptées par date de création.
      </p>
    </div>
  );
}
