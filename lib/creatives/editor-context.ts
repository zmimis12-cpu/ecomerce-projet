/**
 * lib/creatives/editor-context.ts — données communes aux pages de l'espace éditeur.
 * Un éditeur ne voit QUE ses données ; un admin peut consulter un éditeur via ?editor=
 */
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { getCreativesReport, periodRange } from "@/lib/creatives/queries";
import { readPortalConfig, readVideoLinks, portalEarned, payLabel } from "@/lib/creatives/portal";
import { getEditorBalances } from "@/lib/creatives/payment-queries";
import { currentMonth } from "@/components/creatives/period-filter";
import { getCreativesLiveStatus } from "@/lib/ads/meta-status";

/** light = page « Mes produits » : pas de soldes ni de statut Meta en direct (ouverture plus rapide). */
export async function loadEditorContext(sp: Record<string, string>, opts: { light?: boolean } = {}) {
  const session = await requireRole(["video_editor", "super_admin", "admin", "manager"]);
  const isEditor = session.role === "video_editor";
  const editorId = isEditor ? session.authId : (sp.editor || null);
  if (!editorId) redirect("/admin/creatives");

  const month = sp.month ?? currentMonth();
  const [report, { balances, payments }, portal, links] = await Promise.all([
    getCreativesReport({ month, editorId }),
    opts.light ? Promise.resolve({ balances: [], payments: [] } as Awaited<ReturnType<typeof getEditorBalances>>) : getEditorBalances(editorId),
    readPortalConfig(editorId),
    readVideoLinks(editorId),
  ]);
  const live = opts.light
    ? new Map() as Awaited<ReturnType<typeof getCreativesLiveStatus>>
    : await getCreativesLiveStatus(report.creatives.map((c) => c.id));
  const liveInAds = [...live.values()].filter((l) => l.dbStatus === "in_ads").length;
  const { from, to } = periodRange(report.period);
  const rawMe = report.editors[0];
  // Gain de la période selon le mode de rémunération (commission / salaire / par produit)
  const me = rawMe ? { ...rawMe, earnings: portalEarned(portal, rawMe.earnings, links, from, to) } : rawMe;
  const bal = balances[0] ?? { earned: 0, paid: 0, remaining: 0 };
  const commissionOnly = me
    ? me.commissionType === "percent"
      ? `${me.commissionValue}% par commande livrée`
      : `${me.commissionValue} MAD par commande livrée`
    : "—";
  const commissionLabel = payLabel(portal, commissionOnly);
  /** Éditeur en mode restreint : pas de dépense / budget / campagne — seulement le coût de ses vidéos. */
  const hideAdMoney = isEditor && portal.hideAdMoney;

  return { session, isEditor, editorId, month, report, me, bal, payments, commissionLabel, live, liveInAds, portal, links, hideAdMoney };
}

export type EditorContext = Awaited<ReturnType<typeof loadEditorContext>>;
