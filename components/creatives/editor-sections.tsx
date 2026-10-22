import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Film, ShoppingCart, CheckCircle, Award, Eye, MousePointerClick, PhoneCall, Wallet, Package } from "lucide-react";
import type { EditorContext } from "@/lib/creatives/editor-context";
import { PeriodFilter, mad, rate } from "@/components/creatives/period-filter";
import { ctr, ago, videoVerdict } from "@/lib/creatives/queries";
import { TONE_CLS } from "@/lib/ads/meta-status";
import { usesCommission, packProgress } from "@/lib/creatives/portal-shared";
import type { CreativeStat } from "@/lib/creatives/queries";

const STATUS: Record<string, string> = { in_ads: "🟢 En pub", paused: "⏸️ En pause", draft: "📝 Brouillon" };

const VERDICT_CLS = { good: "bg-emerald-100 text-emerald-800", mid: "bg-amber-100 text-amber-800", bad: "bg-rose-100 text-rose-800", wait: "bg-slate-100 text-slate-700" } as const;

export function Verdict({ c }: { c: Parameters<typeof videoVerdict>[0] }) {
  const v = videoVerdict(c);
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_CLS[v.tone]}`}>{v.label}</span>;
}

const TABS = [
  { href: "/admin/editor",          label: "Tableau de bord" },
  { href: "/admin/editor/products", label: "Produits & liens" },
  { href: "/admin/editor/videos",   label: "Vidéos" },
  { href: "/admin/editor/ads",      label: "Stats pubs" },
  { href: "/admin/editor/deliveries", label: "Suivi livraisons" },
  { href: "/admin/editor/orders",   label: "Commandes livrées" },
  { href: "/admin/editor/payments", label: "Paiements" },
];

/** En-tête de page + filtre période + onglets (onglets seulement pour l'admin, l'éditeur a la sidebar). */
export function EditorHeader({
  ctx, title, icon: Icon, current, withFilter = true,
}: { ctx: EditorContext; title: string; icon: LucideIcon; current: string; withFilter?: boolean }) {
  const q = ctx.isEditor ? "" : `?editor=${ctx.editorId}&month=${ctx.report.period}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Icon className="h-5 w-5 text-fuchsia-600" />
            {title}{!ctx.isEditor && ` — ${ctx.me?.name ?? ""}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rémunération : {ctx.commissionLabel}.{(ctx.portal.payMode === "commission" || ctx.portal.plusCommission) && " Seules les commandes livrées comptent pour la commission."}
          </p>
          {!ctx.isEditor && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stats pubs mises à jour {ago(ctx.report.adsUpdatedAt)} · automatique toutes les 15 min
            </p>
          )}
        </div>
        {withFilter && (
          <PeriodFilter period={ctx.report.period} extra={ctx.isEditor ? undefined : { editor: ctx.editorId }} />
        )}
      </div>
      {!ctx.isEditor && (
        <div className="flex flex-wrap gap-1 border-b">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href + q}
              className={"-mb-px border-b-2 px-3 py-2 text-sm " +
                (t.href === current ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatCards({ ctx }: { ctx: EditorContext }) {
  const me = ctx.me;
  // L'éditeur ne voit pas les stats Meta : seulement la qualité des commandes de ses vidéos
  const quality = [
    { label: "Taux de confirmation", value: rate(me?.confirmed ?? 0, me?.treated ?? 0), icon: PhoneCall },
    { label: "Taux de livraison", value: rate(me?.shipDelivered ?? 0, me?.shipDone ?? 0), icon: CheckCircle },
  ];
  const meta = [
    { label: "Impressions", value: (me?.impressions ?? 0).toLocaleString("fr-FR"), icon: Eye },
    { label: "CTR (lien)", value: ctr(me?.linkClicks ?? 0, me?.impressions ?? 0), icon: MousePointerClick },
  ];
  const cards = [
    { label: "Vidéos en pub (direct)", value: `${ctx.liveInAds} / ${me?.videos ?? 0}`, icon: Film },
    ...(ctx.isEditor ? quality : meta),
    { label: "Commandes", value: String(me?.orders ?? 0), icon: ShoppingCart },
    { label: "Livrées", value: `${me?.delivered ?? 0} (${rate(me?.delivered ?? 0, me?.orders ?? 0)})`, icon: CheckCircle },
    { label: "Gains (période)", value: mad(me?.earnings ?? 0), icon: Award },
  ];
  if (ctx.portal.payMode === "per_product") {
    const p = packProgress(ctx.portal, ctx.links);
    cards.splice(1, 0, ctx.portal.perUnit === "pack"
      ? { label: `Vidéos validées (lot de ${p.packSize})`, value: `${p.validated} · prochain lot ${p.inPack}/${p.packSize}`, icon: Film }
      : { label: "Vidéos validées", value: String(p.validated), icon: Film });
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><c.icon className="h-4 w-4" />{c.label}</div>
          <div className="mt-1 text-lg font-semibold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

export function BalanceCards({ ctx }: { ctx: EditorContext }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Total gagné (depuis le début)</div>
        <div className="mt-1 text-lg font-semibold">{mad(ctx.bal.earned)}</div>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs text-muted-foreground">Déjà payé</div>
        <div className="mt-1 text-lg font-semibold text-emerald-700">{mad(ctx.bal.paid)}</div>
      </div>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="text-xs text-amber-800">Reste à payer</div>
        <div className="mt-1 text-lg font-semibold text-amber-800">{mad(ctx.bal.remaining)}</div>
      </div>
    </div>
  );
}

export function VideosTable({ ctx, limit, rows: only, hideProduct }: { ctx: EditorContext; limit?: number; rows?: CreativeStat[]; hideProduct?: boolean }) {
  if (ctx.isEditor) return <EditorVideosTable ctx={ctx} limit={limit} rows={only} hideProduct={hideProduct} />;
  const showGain = usesCommission(ctx.portal); // pas de colonne « Gain » si l'éditeur n'est pas payé à la commission
  const base = only ?? ctx.report.creatives;
  const rows = limit ? [...base].sort((a, b) => b.delivered - a.delivered).slice(0, limit) : base;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Vidéo</th>
            <th className="px-4 py-2">Produit</th>
            <th className="px-4 py-2">Diffusion (direct)</th>
            <th className="px-4 py-2 text-right">Impr.</th>
            <th className="px-4 py-2 text-right">Clics</th>
            <th className="px-4 py-2 text-right">CTR</th>
            <th className="px-4 py-2 text-right">Leads pub</th>
            <th className="px-4 py-2 text-right">Coût / lead</th>
            <th className="px-4 py-2 text-right">Commandes</th>
            <th className="px-4 py-2 text-right">Coût / commande</th>
            <th className="px-4 py-2 text-right">Livrées</th>
            <th className="px-4 py-2 text-right">Taux</th>
            <th className="px-4 py-2 text-right">Confirm.</th>
            <th className="px-4 py-2">Verdict</th>
            {showGain && <th className="px-4 py-2 text-right">Gain</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={showGain ? 16 : 15} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo pour le moment.</td></tr>
          )}
          {rows.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2 font-mono font-semibold">{c.code}</td>
              <td className="px-4 py-2">{c.videoUrl
                ? <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.title}</a>
                : c.title}</td>
              <td className="px-4 py-2">{c.productName}</td>
              <td className="px-4 py-2">
                {(() => { const l = ctx.live.get(c.id); return l
                  ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLS[l.tone]}`} title={l.detail}>{l.label}</span>
                  : <span className="text-xs">{STATUS[c.status] ?? c.status}</span>; })()}
              </td>
              <td className="px-4 py-2 text-right">{c.impressions.toLocaleString("fr-FR")}</td>
              <td className="px-4 py-2 text-right">{c.linkClicks.toLocaleString("fr-FR")}</td>
              <td className="px-4 py-2 text-right">{ctr(c.linkClicks, c.impressions)}</td>
              <td className="px-4 py-2 text-right">{c.adLeads}{c.messages ? <span className="text-xs text-muted-foreground"> +{c.messages} msg</span> : null}</td>
              <td className="px-4 py-2 text-right">{c.adLeads > 0 ? `${Math.round(c.spend / c.adLeads)} MAD` : "—"}</td>
              <td className="px-4 py-2 text-right">{c.orders}</td>
              <td className="px-4 py-2 text-right">{c.orders > 0 && c.spend > 0 ? `${Math.round(c.spend / c.orders)} MAD` : "—"}</td>
              <td className="px-4 py-2 text-right">{c.delivered}</td>
              <td className="px-4 py-2 text-right">{rate(c.delivered, c.orders)}</td>
              <td className="px-4 py-2 text-right">{rate(c.confirmed, c.treated)}</td>
              <td className="px-4 py-2"><Verdict c={c} /></td>
              {showGain && <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(c.earnings)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vue éditeur : pas d'impressions / clics / CTR / coûts — seulement si la vidéo vend bien. */
function EditorVideosTable({ ctx, limit, rows: only, hideProduct }: { ctx: EditorContext; limit?: number; rows?: CreativeStat[]; hideProduct?: boolean }) {
  const showGain = usesCommission(ctx.portal);
  const base = only ?? ctx.report.creatives;
  const rows = limit ? [...base].sort((a, b) => b.delivered - a.delivered).slice(0, limit) : base;
  const cols = (showGain ? 11 : 10) - (hideProduct ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Vidéo</th>
            {!hideProduct && <th className="px-4 py-2">Produit</th>}
            <th className="px-4 py-2">Diffusion</th>
            <th className="px-4 py-2">Verdict</th>
            <th className="px-4 py-2 text-right">Commandes</th>
            <th className="px-4 py-2 text-right">Confirmées</th>
            <th className="px-4 py-2 text-right">Taux confirmation</th>
            <th className="px-4 py-2 text-right">Livrées</th>
            <th className="px-4 py-2 text-right">Taux livraison</th>
            {showGain && <th className="px-4 py-2 text-right">Gain</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo pour le moment.</td></tr>
          )}
          {rows.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2 font-mono font-semibold">{c.code}</td>
              <td className="px-4 py-2">{c.videoUrl
                ? <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.title}</a>
                : c.title}</td>
              {!hideProduct && <td className="px-4 py-2">{c.productName}</td>}
              <td className="px-4 py-2">
                {(() => { const l = ctx.live.get(c.id); return l
                  ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLS[l.tone]}`}>{l.label}</span>
                  : <span className="text-xs">{STATUS[c.status] ?? c.status}</span>; })()}
              </td>
              <td className="px-4 py-2"><Verdict c={c} /></td>
              <td className="px-4 py-2 text-right">{c.orders}</td>
              <td className="px-4 py-2 text-right">{c.confirmed}</td>
              <td className="px-4 py-2 text-right">{rate(c.confirmed, c.treated)}</td>
              <td className="px-4 py-2 text-right">{c.delivered}</td>
              <td className="px-4 py-2 text-right">{rate(c.shipDelivered, c.shipDone)}</td>
              {showGain && <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(c.earnings)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        ✅ Bonne vidéo = les clients confirment et reçoivent bien leur commande · ⏳ En test = pas encore assez de commandes pour juger.
      </p>
    </div>
  );
}

export function DeliveredTable({ ctx }: { ctx: EditorContext }) {
  const rows = ctx.report.deliveredOrders;
  const showGain = usesCommission(ctx.portal);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Commande</th>
            <th className="px-4 py-2">Vidéo</th>
            <th className="px-4 py-2">Produit</th>
            <th className="px-4 py-2">Livrée le</th>
            {showGain && <th className="px-4 py-2 text-right">Gain</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={showGain ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">Aucune commande livrée sur cette période.</td></tr>
          )}
          {rows.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="px-4 py-2 font-mono">{o.orderNumber}</td>
              <td className="px-4 py-2">{o.creativeCode} · {o.creativeTitle}</td>
              <td className="px-4 py-2">{o.productName}</td>
              <td className="px-4 py-2">{new Date(o.deliveredAt).toLocaleDateString("fr-FR")}</td>
              {showGain && <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(o.earning)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Rémunération : explique simplement le mode choisi par l'admin ─────────────── */
export function PayPlanCard({ ctx }: { ctx: EditorContext }) {
  const c = ctx.portal;
  const me = ctx.me;
  const lines: { k: string; v: string }[] = [];
  let progress: { done: number; total: number; label: string } | null = null;
  if (c.payMode === "commission") {
    lines.push({ k: "Mode", v: ctx.commissionLabel });
    lines.push({ k: "Commandes livrées (période)", v: String(me?.delivered ?? 0) });
  } else if (c.payMode === "salary") {
    lines.push({ k: "Mode", v: `Salaire fixe ${mad(c.salary)} / mois` });
    if (c.salaryStart) lines.push({ k: "Depuis le", v: new Date(c.salaryStart).toLocaleDateString("fr-FR") });
  } else {
    const p = packProgress(c, ctx.links);
    if (c.perUnit === "pack") {
      lines.push({ k: "Mode", v: `${mad(c.perAmount)} par lot de ${p.packSize} vidéos validées` });
      lines.push({ k: "Lots terminés", v: `${p.packs} (${mad(p.packs * c.perAmount)})` });
      progress = { done: p.inPack, total: p.packSize, label: `Prochain lot : encore ${p.packSize - p.inPack} vidéo(s) validée(s) → ${mad(c.perAmount)}` };
    } else {
      lines.push({ k: "Mode", v: `${mad(c.perAmount)} par ${c.perUnit === "video" ? "vidéo validée" : "produit validé"}` });
      lines.push({ k: "Vidéos validées", v: String(p.validated) });
    }
  }
  if (c.payMode !== "commission" && c.plusCommission) lines.push({ k: "+ Bonus", v: "commission sur chaque commande livrée" });
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-fuchsia-600" /> Ma rémunération</div>
      <dl className="grid gap-1.5 text-sm">
        {lines.map((l) => (
          <div key={l.k} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{l.k}</dt><dd className="text-right font-medium">{l.v}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t pt-1.5">
          <dt className="text-muted-foreground">Gagné sur la période</dt><dd className="text-right text-base font-semibold text-emerald-700">{mad(me?.earnings ?? 0)}</dd>
        </div>
      </dl>
      {progress && (
        <div className="mt-3">
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{progress.done}/{progress.total} · {progress.label}</p>
        </div>
      )}
    </div>
  );
}

/* ── Vidéos regroupées par produit ─────────────────────────────────────────────── */
export type ProductCardInfo = { id: string; name: string; image: string | null };

function groupByProduct(ctx: EditorContext) {
  const groups = new Map<string, CreativeStat[]>();
  for (const c of ctx.report.creatives) {
    const k = c.productId ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const sum = (rows: CreativeStat[], f: (c: CreativeStat) => number) => rows.reduce((t, c) => t + f(c), 0);
  return [...groups.entries()].map(([pid, rows]) => ({
    pid, rows, name: rows[0]?.productName ?? "—",
    orders: sum(rows, (c) => c.orders), confirmed: sum(rows, (c) => c.confirmed), treated: sum(rows, (c) => c.treated),
    shipDone: sum(rows, (c) => c.shipDone), shipDelivered: sum(rows, (c) => c.shipDelivered), delivered: sum(rows, (c) => c.delivered),
    earnings: sum(rows, (c) => c.earnings), latest: rows.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), ""),
  })).sort((a, b) => b.latest.localeCompare(a.latest));
}

export function ProductGroups({ ctx, products }: { ctx: EditorContext; products: ProductCardInfo[] }) {
  const img = new Map(products.map((p) => [p.id, p.image]));
  const groups = groupByProduct(ctx);
  if (!groups.length) return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Aucune vidéo pour le moment.</p>;
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.pid} className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
            {img.get(g.pid)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={img.get(g.pid)!} alt="" className="h-12 w-12 rounded-lg border object-cover" />
              : <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-background"><Package className="h-5 w-5 text-muted-foreground" /></div>}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold" dir="auto">{g.name}</h2>
              <p className="text-xs text-muted-foreground">{g.rows.length} vidéo{g.rows.length > 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Chip label="Commandes" value={String(g.orders)} />
              <Chip label="Confirmation" value={rate(g.confirmed, g.treated)} />
              <Chip label="Livraison" value={rate(g.shipDelivered, g.shipDone)} />
              <Chip label="Livrées" value={String(g.delivered)} />
              {usesCommission(ctx.portal) && <Chip label="Gain" value={mad(g.earnings)} strong />}
            </div>
          </div>
          <VideosTable ctx={ctx} rows={g.rows} hideProduct />
        </section>
      ))}
    </div>
  );
}

function Chip({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className={"rounded-lg border bg-background px-2.5 py-1 " + (strong ? "border-emerald-200 text-emerald-700" : "")}>
      <span className="text-muted-foreground">{label} </span><b>{value}</b>
    </span>
  );
}

/** Résumé compact par produit (tableau de bord) */
export function ProductSummary({ ctx, products }: { ctx: EditorContext; products: ProductCardInfo[] }) {
  const img = new Map(products.map((p) => [p.id, p.image]));
  const groups = groupByProduct(ctx);
  if (!groups.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => (
        <div key={g.pid} className="flex gap-3 rounded-xl border bg-card p-3">
          {img.get(g.pid)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img.get(g.pid)!} alt="" className="h-16 w-16 shrink-0 rounded-lg border object-cover" />
            : <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border"><Package className="h-5 w-5 text-muted-foreground" /></div>}
          <div className="min-w-0 flex-1 text-xs">
            <div className="truncate text-sm font-semibold" dir="auto">{g.name}</div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground">
              <span>Vidéos <b className="text-foreground">{g.rows.length}</b></span>
              <span>Commandes <b className="text-foreground">{g.orders}</b></span>
              <span>Confirmation <b className="text-foreground">{rate(g.confirmed, g.treated)}</b></span>
              <span>Livraison <b className="text-foreground">{rate(g.shipDelivered, g.shipDone)}</b></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
