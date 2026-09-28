import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, Users, Info } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCreativesReport, adLink } from "@/lib/creatives/queries";
import {
  CreateCreativeForm, CreativeStatusSelect, CopyLinkButton, EditorCommissionForm,
} from "@/components/creatives/creative-controls";
import { PeriodFilter, currentMonth, mad, rate } from "@/components/creatives/period-filter";

export const metadata: Metadata = { title: "Vidéos & Éditeurs" };
export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { meta: "Meta", tiktok: "TikTok", other: "Autre" };

export default async function CreativesAdminPage({
  searchParams,
}: { searchParams: Promise<Record<string, string>> }) {
  await requireRole(["super_admin", "admin", "manager"]);
  const sp = await searchParams;
  const month = sp.month ?? currentMonth();

  const [report, { data: productsRaw }] = await Promise.all([
    getCreativesReport({ month }),
    supabaseAdmin.from("products").select("id, name").eq("is_active", true).order("name"),
  ]);
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

      {/* Nouvelle vidéo */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-medium">Ajouter une vidéo</h2>
        <CreateCreativeForm editors={report.editors.filter((e) => e.isActive)} products={products} />
      </section>

      {/* Vidéos */}
      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3"><h2 className="font-medium">Vidéos ({report.creatives.length})</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Vidéo</th>
                <th className="px-4 py-2">Éditeur</th>
                <th className="px-4 py-2">Produit</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Commandes</th>
                <th className="px-4 py-2 text-right">Livrées</th>
                <th className="px-4 py-2 text-right">Taux</th>
                <th className="px-4 py-2 text-right">Gain éditeur</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {report.creatives.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">Aucune vidéo.</td></tr>
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
                  <td className="px-4 py-2">{c.editorName}</td>
                  <td className="px-4 py-2">{c.productName}</td>
                  <td className="px-4 py-2"><CreativeStatusSelect id={c.id} status={c.status} /></td>
                  <td className="px-4 py-2 text-right">{c.orders}</td>
                  <td className="px-4 py-2 text-right">{c.delivered}</td>
                  <td className="px-4 py-2 text-right">{rate(c.delivered, c.orders)}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{mad(c.earnings)}</td>
                  <td className="px-4 py-2 text-right"><CopyLinkButton link={adLink(c.lpSlug, c.code)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
