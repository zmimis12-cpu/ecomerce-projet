import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Users, Info, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCreativesReport, adLink, getRecentAds, ctr, ago } from "@/lib/creatives/queries";
import {
  CreateCreativeForm, CopyLinkButton, EditorCommissionForm,
  CreativeEditorSelect, DeleteCreativeButton, AdLinkSelect,
} from "@/components/creatives/creative-controls";
import { PeriodFilter, currentMonth, mad, rate } from "@/components/creatives/period-filter";
import { getEditorBalances } from "@/lib/creatives/payment-queries";
import { getCreativesLiveStatus, getMetaDeliveries, TONE_CLS } from "@/lib/ads/meta-status";
import { AddPaymentForm } from "@/components/creatives/payment-controls";
import { RateForm, DeleteRateButton } from "@/components/creatives/rate-controls";
import { PaymentsList } from "@/components/creatives/payments-list";

export const metadata: Metadata = { title: "Vidéos & Éditeurs" };
export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { meta: "Meta", tiktok: "TikTok", other: "Autre" };

export default async function CreativesAdminPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  const session = await requireRole(["super_admin", "admin", "manager"]);
  const sp = await searchParams;
  const month = sp.month ?? currentMonth();

  const [report, { data: productsRaw }, { balances, payments }, recentAds] = await Promise.all([
    getCreativesReport({ month }),
    supabaseAdmin.from("products").select("id, name").eq("is_active", true).order("name"),
    getEditorBalances(),
    getRecentAds(),
  ]);
  const { data: ratesRaw } = await supabaseAdmin
    .from("video_editor_rates" as never)
    .select("id, editor_id, product_id, commission_type, commission_value")
    .order("created_at", { ascending: false });
  const rates = (ratesRaw ?? []) as { id: string; editor_id: string | null; product_id: string; commission_type: string; commission_value: number }[];
  const totalRemaining = balances.reduce((s, b) => s + Math.max(0, b.remaining), 0);
  // Statuts EN DIRECT depuis Meta (plus de choix manuel "En pub / En pause")
  const [liveStatus, adDeliveries] = await Promise.all([
    getCreativesLiveStatus(report.creatives.map((c) => c.id)),
    getMetaDeliveries(recentAds.filter((a) => a.platform === "meta").map((a) => a.adId)),
  ]);
  const editorNames = new Map(balances.map((b) => [b.editorId, b.name]));
  const products = (productsRaw ?? []) as { id: string; name: string }[];
  const totalEarnings = report.editors.reduce((s, e) => s + e.earnings, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Clapperboard className="h-5 w-5 text-fuchsia-600" /> Vidéos & Éditeurs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gains calculés sur les commandes livrées générées par chaque vidéo.
          </p>
        </div>
        <PeriodFilter period={report.period} />
      </div>

      <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          Pour chaque pub, utilise le <b>« Lien pub »</b> de la vidéo comme URL du site dans Meta/TikTok
          (ex: <code>…/lp/produit?cr=V001</code>). Une pub = une vidéo = un lien. Sans ce lien, la commande
          n&apos;est attribuée à aucun éditeur.
        </div>
      </div>

      {/* Éditeurs */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> Éditeurs</h2>
          <span className="text-sm">Total à payer : <b>{mad(totalEarnings)}</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Éditeur</th>
                <th className="px-4 py-2">Rémunération</th>
                <th className="px-4 py-2 text-right">Vidéos en pub</th>
                <th className="px-4 py-2 text-right">Commandes</th>
                <th className="px-4 py-2 text-right">Livrées</th>
                <th className="px-4 py-2 text-right">Taux</th>
                <th className="px-4 py-2 text-right">Gain</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {report.editors.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  Aucun éditeur. Crée un compte dans Paramètres → Utilisateurs avec le rôle « Éditeur Vidéo ».
                </td></tr>
              )}
              {report.editors.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">{e.email}{!e.isActive && " · désactivé"}</div>
                  </td>
                  <td className="px-4 py-2">
                    <EditorCommissionForm userId={e.id} type={e.commissionType} value={e.commissionValue} />
                  </td>
                  <td className="px-4 py-2 text-right">{e.videosInAds} / {e.videos}</td>
                  <td className="px-4 py-2 text-right">{e.orders}</td>
                  <td className="px-4 py-2 text-right">{e.delivered}</td>
                  <td className="px-4 py-2 text-right">{rate(e.delivered, e.orders)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(e.earnings)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/editor?editor=${e.id}&month=${report.period}`} className="text-xs text-primary hover:underline">
                      Détail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tarifs flexibles */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Tarifs par produit</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Priorité : tarif (éditeur + produit) → tarif produit pour tous → tarif de base de l&apos;éditeur (tableau Éditeurs).
            Le gain est <b>figé au moment de la livraison</b> : changer un tarif ne modifie pas ce qui est déjà gagné.
          </p>
        </div>
        <div className="space-y-3 p-4">
          <RateForm editors={report.editors.map((e) => ({ id: e.id, name: e.name }))} products={products} />
          {rates.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1">Éditeur</th><th className="py-1">Produit</th><th className="py-1">Tarif</th><th /></tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-1.5">{r.editor_id ? report.editors.find((e) => e.id === r.editor_id)?.name ?? "—" : <i>Tous</i>}</td>
                    <td className="py-1.5">{products.find((p) => p.id === r.product_id)?.name ?? "—"}</td>
                    <td className="py-1.5 font-semibold">{r.commission_type === "percent" ? `${r.commission_value} %` : `${r.commission_value} MAD / livrée`}</td>
                    <td className="py-1.5 text-right"><DeleteRateButton id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Paiements */}
      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-medium"><Wallet className="h-4 w-4" /> Paiements éditeurs</h2>
          <span className="text-sm">Reste à payer (total) : <b className="text-amber-700">{mad(totalRemaining)}</b></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Éditeur</th>
                <th className="px-4 py-2 text-right">Total gagné</th>
                <th className="px-4 py-2 text-right">Déjà payé</th>
                <th className="px-4 py-2 text-right">Reste à payer</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.editorId} className="border-t">
                  <td className="px-4 py-2 font-medium">{b.name}</td>
                  <td className="px-4 py-2 text-right">{mad(b.earned)}</td>
                  <td className="px-4 py-2 text-right">{mad(b.paid)}</td>
                  <td className={"px-4 py-2 text-right font-semibold " + (b.remaining > 0 ? "text-amber-700" : b.remaining < 0 ? "text-red-600" : "text-emerald-700")}>
                    {mad(b.remaining)}{b.remaining < 0 && " (avance)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t p-4">
          <h3 className="mb-3 text-sm font-medium">Enregistrer un paiement</h3>
          <AddPaymentForm editors={balances.map((b) => ({ id: b.editorId, name: b.name, remaining: b.remaining }))} />
        </div>
        <div className="border-t">
          <h3 className="px-4 pt-3 text-sm font-medium">Historique des paiements</h3>
          <PaymentsList payments={payments} editorNames={editorNames}
            canDelete={session.role === "super_admin" || session.role === "admin"} />
        </div>
      </section>

      {/* Nouvelle vidéo */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-medium">Ajouter une vidéo</h2>
        <CreateCreativeForm editors={report.editors.filter((e) => e.isActive)} products={products} />
      </section>

      {/* Vidéos */}
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-medium">Vidéos ({report.creatives.length})</h2>
          <span className="text-xs text-muted-foreground">Stats pubs mises à jour {ago(report.adsUpdatedAt)} · automatique toutes les 15 min</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Vidéo</th>
                <th className="px-4 py-2">Éditeur</th>
                <th className="px-4 py-2">Produit</th>
                <th className="px-4 py-2">Diffusion (Meta, en direct)</th>
                <th className="px-4 py-2 text-right">Impr.</th>
                <th className="px-4 py-2 text-right">CTR</th>
                <th className="px-4 py-2 text-right">Leads pub</th>
                <th className="px-4 py-2 text-right">Dépense</th>
                <th className="px-4 py-2 text-right">Coût / lead</th>
                <th className="px-4 py-2 text-right">Commandes</th>
                <th className="px-4 py-2 text-right">Coût / commande</th>
                <th className="px-4 py-2 text-right">Livrées</th>
                <th className="px-4 py-2 text-right">Taux</th>
                <th className="px-4 py-2 text-right">Coût / livrée</th>
                <th className="px-4 py-2 text-right">Gain éditeur</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {report.creatives.length === 0 && (
                <tr><td colSpan={17} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo.</td></tr>
              )}
              {report.creatives.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-mono font-semibold">{c.code}</td>
                  <td className="px-4 py-2">
                    <div>{c.videoUrl
                      ? <a href={c.videoUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{c.title}</a>
                      : c.title}</div>
                    <div className="text-xs text-muted-foreground">{PLATFORM[c.platform] ?? c.platform}</div>
                  </td>
                  <td className="px-4 py-2">
                    <CreativeEditorSelect
                      id={c.id}
                      editorId={c.editorId}
                      editors={report.editors.map((e) => ({ id: e.id, name: e.name }))}
                    />
                  </td>
                  <td className="px-4 py-2">{c.productName}</td>
                  <td className="px-4 py-2">
                    {(() => { const l = liveStatus.get(c.id); return l ? (
                      <div>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLS[l.tone]}`}>{l.label}</span>
                        {l.detail && <div className="mt-0.5 text-[10px] text-muted-foreground">{l.detail}</div>}
                      </div>) : "—"; })()}
                  </td>
                  <td className="px-4 py-2 text-right" title={`${c.adsCount} pub(s) liée(s)`}>
                    {c.adsCount ? c.impressions.toLocaleString("fr-FR") : <span className="text-xs text-amber-600">0 pub liée</span>}
                  </td>
                  <td className="px-4 py-2 text-right">{ctr(c.linkClicks, c.impressions)}</td>
                  <td className="px-4 py-2 text-right">{c.adLeads}{c.messages ? <span className="text-xs text-muted-foreground"> +{c.messages} msg</span> : null}</td>
                  <td className="px-4 py-2 text-right">{c.spend ? mad(c.spend) : "—"}</td>
                  <td className="px-4 py-2 text-right">{c.adLeads && c.spend ? mad(Math.round(c.spend / c.adLeads)) : "—"}</td>
                  <td className="px-4 py-2 text-right">{c.orders}</td>
                  <td className="px-4 py-2 text-right">{c.orders && c.spend ? mad(Math.round(c.spend / c.orders)) : "—"}</td>
                  <td className="px-4 py-2 text-right">{c.delivered}</td>
                  <td className="px-4 py-2 text-right">{rate(c.delivered, c.orders)}</td>
                  <td className="px-4 py-2 text-right">{c.delivered && c.spend ? mad(Math.round(c.spend / c.delivered)) : "—"}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(c.earnings)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <CopyLinkButton link={adLink(c.lpSlug, c.code)} />
                      <DeleteCreativeButton id={c.id} code={c.code} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pubs Meta / TikTok ↔ vidéos */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Pubs Meta / TikTok (30 derniers jours)</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Une pub dont le nom contient le code (ex: « V001 - hook ») est liée automatiquement.
            Sinon, choisis la vidéo ici. Les pubs non liées ne comptent pour aucun éditeur.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Pub</th>
                <th className="px-4 py-2">Campagne</th>
                <th className="px-4 py-2">Diffusion</th>
                <th className="px-4 py-2 text-right">Impr.</th>
                <th className="px-4 py-2 text-right">Dépense</th>
                <th className="px-4 py-2">Vidéo liée</th>
              </tr>
            </thead>
            <tbody>
              {recentAds.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Aucune donnée pub pour l&apos;instant (la synchro automatique tourne toutes les 15 min).
                </td></tr>
              )}
              {recentAds.map((a) => (
                <tr key={a.platform + a.adId} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{a.adName}</div>
                    <div className="text-xs text-muted-foreground">{a.platform === "meta" ? "Meta" : "TikTok"} · {a.adId}</div>
                  </td>
                  <td className="px-4 py-2 text-xs">{a.campaignName}</td>
                  <td className="px-4 py-2">
                    {(() => { const d = adDeliveries.get(a.adId); return d
                      ? <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLS[d.tone]}`}>{d.label}</span>
                      : <span className="text-xs text-muted-foreground">—</span>; })()}
                  </td>
                  <td className="px-4 py-2 text-right">{a.impressions.toLocaleString("fr-FR")}</td>
                  <td className="px-4 py-2 text-right">{mad(a.spend)}</td>
                  <td className="px-4 py-2">
                    <AdLinkSelect platform={a.platform} adId={a.adId} creativeId={a.creativeId}
                      creatives={report.creatives.map((c) => ({ id: c.id, code: c.code, title: c.title }))} />
                    {a.linkedBy === "auto" && <span className="ms-1 text-[10px] text-muted-foreground">auto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
