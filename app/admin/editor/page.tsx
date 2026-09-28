import type { Metadata } from "next";
import { Clapperboard, Film, ShoppingCart, CheckCircle, Award } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { getCreativesReport } from "@/lib/creatives/queries";
import { PeriodFilter, currentMonth, mad, rate } from "@/components/creatives/period-filter";
import { getEditorBalances } from "@/lib/creatives/payment-queries";
import { PaymentsList } from "@/components/creatives/payments-list";

export const metadata: Metadata = { title: "Mes vidéos & gains" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { in_ads: "🟢 En pub", paused: "⏸️ En pause", draft: "📝 Brouillon" };

export default async function EditorPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const session = await requireRole(["video_editor", "super_admin", "admin", "manager"]);
  const sp = await searchParams;
  const month = sp.month ?? currentMonth();

  // Un éditeur ne voit QUE ses données ; un admin peut consulter un éditeur via ?editor=
  const isEditor = session.role === "video_editor";
  const editorId = isEditor ? session.authId : (sp.editor || null);

  if (!editorId) {
    return <p className="text-sm text-muted-foreground">Choisis un éditeur depuis la page Vidéos & Éditeurs.</p>;
  }

  const [report, { balances, payments }] = await Promise.all([
    getCreativesReport({ month, editorId }),
    getEditorBalances(editorId),
  ]);
  const bal = balances[0] ?? { earned: 0, paid: 0, remaining: 0 };
  const me = report.editors[0];
  const commissionLabel = me
    ? me.commissionType === "percent" ? `${me.commissionValue}% par commande livrée` : `${me.commissionValue} MAD par commande livrée`
    : "—";

  const cards = [
    { label: "Vidéos en pub", value: `${me?.videosInAds ?? 0} / ${me?.videos ?? 0}`, icon: Film },
    { label: "Commandes", value: String(me?.orders ?? 0), icon: ShoppingCart },
    { label: "Livrées", value: `${me?.delivered ?? 0} (${rate(me?.delivered ?? 0, me?.orders ?? 0)})`, icon: CheckCircle },
    { label: "Gains (période)", value: mad(me?.earnings ?? 0), icon: Award },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Clapperboard className="h-5 w-5 text-fuchsia-600" />
            {isEditor ? "Mes vidéos & gains" : `Éditeur : ${me?.name ?? "—"}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Rémunération : {commissionLabel}. Seules les commandes livrées comptent.</p>
        </div>
        <PeriodFilter period={report.period} extra={isEditor ? undefined : { editor: editorId }} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><c.icon className="h-4 w-4" />{c.label}</div>
            <div className="mt-1 text-lg font-semibold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Total gagné (depuis le début)</div>
          <div className="mt-1 text-lg font-semibold">{mad(bal.earned)}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Déjà payé</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">{mad(bal.paid)}</div>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-xs text-amber-800">Reste à payer</div>
          <div className="mt-1 text-lg font-semibold text-amber-800">{mad(bal.remaining)}</div>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Mes paiements</h2></div>
        <PaymentsList payments={payments} canDelete={false} />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Mes vidéos</h2></div>
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
              {report.creatives.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo pour le moment.</td></tr>
              )}
              {report.creatives.map((c) => (
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
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Commandes livrées ({report.deliveredOrders.length})</h2></div>
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
              {report.deliveredOrders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">Aucune commande livrée sur cette période.</td></tr>
              )}
              {report.deliveredOrders.map((o) => (
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
      </section>
    </div>
  );
}
