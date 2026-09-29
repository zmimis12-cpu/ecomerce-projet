import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Film, ShoppingCart, CheckCircle, Award } from "lucide-react";
import type { EditorContext } from "@/lib/creatives/editor-context";
import { PeriodFilter, mad, rate } from "@/components/creatives/period-filter";

const STATUS: Record<string, string> = { in_ads: "🟢 En pub", paused: "⏸️ En pause", draft: "📝 Brouillon" };

const TABS = [
  { href: "/admin/editor",          label: "Tableau de bord" },
  { href: "/admin/editor/videos",   label: "Vidéos" },
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
            Rémunération : {ctx.commissionLabel}. Seules les commandes livrées comptent.
          </p>
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
  const cards = [
    { label: "Vidéos en pub", value: `${me?.videosInAds ?? 0} / ${me?.videos ?? 0}`, icon: Film },
    { label: "Commandes", value: String(me?.orders ?? 0), icon: ShoppingCart },
    { label: "Livrées", value: `${me?.delivered ?? 0} (${rate(me?.delivered ?? 0, me?.orders ?? 0)})`, icon: CheckCircle },
    { label: "Gains (période)", value: mad(me?.earnings ?? 0), icon: Award },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

export function VideosTable({ ctx, limit }: { ctx: EditorContext; limit?: number }) {
  const rows = limit ? [...ctx.report.creatives].sort((a, b) => b.delivered - a.delivered).slice(0, limit) : ctx.report.creatives;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Vidéo</th>
            <th className="px-4 py-2">Produit</th>
            <th className="px-4 py-2">Statut</th>
            <th className="px-4 py-2 text-right">Commandes</th>
            <th className="px-4 py-2 text-right">Livrées</th>
            <th className="px-4 py-2 text-right">Taux</th>
            <th className="px-4 py-2 text-right">Gain</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo pour le moment.</td></tr>
          )}
          {rows.map((c) => (
            <tr key={c.id} className="border-t">
              <td className="px-4 py-2 font-mono font-semibold">{c.code}</td>
              <td className="px-4 py-2">{c.videoUrl
                ? <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.title}</a>
                : c.title}</td>
              <td className="px-4 py-2">{c.productName}</td>
              <td className="px-4 py-2 text-xs">{STATUS[c.status] ?? c.status}</td>
              <td className="px-4 py-2 text-right">{c.orders}</td>
              <td className="px-4 py-2 text-right">{c.delivered}</td>
              <td className="px-4 py-2 text-right">{rate(c.delivered, c.orders)}</td>
              <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(c.earnings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DeliveredTable({ ctx }: { ctx: EditorContext }) {
  const rows = ctx.report.deliveredOrders;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">Commande</th>
            <th className="px-4 py-2">Vidéo</th>
            <th className="px-4 py-2">Produit</th>
            <th className="px-4 py-2">Livrée le</th>
            <th className="px-4 py-2 text-right">Gain</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Aucune commande livrée sur cette période.</td></tr>
          )}
          {rows.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="px-4 py-2 font-mono">{o.orderNumber}</td>
              <td className="px-4 py-2">{o.creativeCode} · {o.creativeTitle}</td>
              <td className="px-4 py-2">{o.productName}</td>
              <td className="px-4 py-2">{new Date(o.deliveredAt).toLocaleDateString("fr-FR")}</td>
              <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(o.earning)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
